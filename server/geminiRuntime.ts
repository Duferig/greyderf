import { GoogleGenAI } from '@google/genai';
import {
  ChapterControlPassPayload,
  ChapterControlResult,
  LookupOriginalTermPayload,
  PreviousChapterContext,
  TranslateChunkPayload,
} from '../geminiApi';
import { GlossaryItem, NewTermDiscovery, TermCategory } from '../types';
import { createDiscoveredTermDecision, createGlossaryItem } from '../services/projectUtils';

type RawGlossaryTerm = {
  term?: string;
  translation?: string;
  category?: TermCategory;
};

type RawNewTerm = {
  term?: string;
  suggestedTranslation?: string;
  context?: string;
  category?: TermCategory;
  confidence?: number | string;
};

export class GeminiRuntimeService {
  private ai: GoogleGenAI | null;
  private apiKey: string;
  private readonly quotaRetryLimit = 4;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    this.ai = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
  }

  isConfigured(): boolean {
    return !!this.ai;
  }

  private getClient(): GoogleGenAI {
    if (!this.ai) {
      throw new Error('Missing GEMINI_API_KEY on the server.');
    }

    return this.ai;
  }

  private cleanAndParseJson<T>(text: string, fallback: T): T {
    if (!text?.trim()) return fallback;

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = Math.min(
      ...['{', '[']
        .map((token) => cleaned.indexOf(token))
        .filter((index) => index >= 0)
    );

    const normalized =
      Number.isFinite(start) && start >= 0
        ? cleaned.slice(start, Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']')) + 1)
        : cleaned;

    try {
      return JSON.parse(normalized) as T;
    } catch {
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        return fallback;
      }
    }
  }

  private buildGlossaryBlock(glossary: GlossaryItem[]): string {
    if (glossary.length === 0) {
      return 'No approved glossary yet.';
    }

    return glossary
      .map((item) => `${item.term} -> ${item.translation} [${item.category}]`)
      .join('\n');
  }

  private getErrorText(error: unknown): string {
    if (error instanceof Error) {
      return error.message || String(error);
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private isQuotaRetryableError(error: unknown): boolean {
    const errorText = this.getErrorText(error);
    return /429|RESOURCE_EXHAUSTED|quota exceeded|Please retry in|retryDelay/i.test(errorText);
  }

  private extractRetryDelayMs(error: unknown): number {
    const errorText = this.getErrorText(error);

    const directRetryMatch = errorText.match(/Please retry in\s+([\d.]+)s/i);
    if (directRetryMatch) {
      return Math.ceil(Number(directRetryMatch[1]) * 1000);
    }

    const retryDelayMatch = errorText.match(/retryDelay\\?"?\s*[:=]\s*\\?"?([\d.]+)s/i);
    if (retryDelayMatch) {
      return Math.ceil(Number(retryDelayMatch[1]) * 1000);
    }

    return 60000;
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildPreviousChapterExcerpt(previousChapterContext: PreviousChapterContext | null): string {
    if (!previousChapterContext) {
      return 'No previous translated chapter is available yet.';
    }

    const paragraphs = previousChapterContext.translatedText
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    const selectedParagraphs = paragraphs.slice(-4);
    let excerpt = selectedParagraphs.join('\n\n');

    while (excerpt.length > 8000 && selectedParagraphs.length > 2) {
      selectedParagraphs.shift();
      excerpt = selectedParagraphs.join('\n\n');
    }

    if (excerpt.length > 8000) {
      excerpt = excerpt.slice(-8000).trim();
    }

    return `Previous chapter file: ${previousChapterContext.fileName}

Previously translated Russian text from the final 2-4 paragraphs of the previous chapter:
${excerpt || previousChapterContext.translatedText.slice(-4000)}`;
  }

  private buildCurrentChapterExcerpt(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return 'No previous translated excerpt from the current chapter yet.';
    return trimmed.slice(-5000);
  }

  private async generateContentWithRetry(
    request: Parameters<GoogleGenAI['models']['generateContent']>[0],
    label: string
  ) {
    const client = this.getClient();

    for (let attempt = 0; attempt <= this.quotaRetryLimit; attempt += 1) {
      try {
        return await client.models.generateContent(request);
      } catch (error) {
        if (!this.isQuotaRetryableError(error) || attempt >= this.quotaRetryLimit) {
          throw error;
        }

        const waitMs = this.extractRetryDelayMs(error) + 1500;
        console.warn(
          `${label} hit quota/rate limit. Waiting ${Math.ceil(waitMs / 1000)}s before retry ${
            attempt + 1
          }/${this.quotaRetryLimit}.`,
          error
        );
        await this.wait(waitMs);
      }
    }

    throw new Error(`${label} failed after exhausting retry attempts.`);
  }

  private buildTranslationSystemInstruction(
    basePrompt: string,
    glossary: GlossaryItem[],
    previousChapterContext: PreviousChapterContext | null
  ): string {
    return `
${basePrompt}

PROJECT RULES:
1. Translate into high-quality natural Russian.
2. Never summarize, shorten, or skip prose.
3. If a glossary term appears, you MUST use the approved translation exactly as written.
4. Keep names, techniques, organizations, titles, and locations stable across chapters.
5. Output only the translated chapter text. No notes, no JSON, no commentary.

APPROVED GLOSSARY:
${this.buildGlossaryBlock(glossary)}

PREVIOUS CHAPTER CONTEXT:
Use this only to keep names, techniques, titles, and scene carryover consistent across the chapter boundary.
${this.buildPreviousChapterExcerpt(previousChapterContext)}
`.trim();
  }

  async extractGlossary(text: string, analysisModel: string): Promise<GlossaryItem[]> {
    if (!text.trim()) return [];

    const prompt = `
You extract glossary terms for a Russian novel localization project.

Return JSON only:
[
  {
    "term": "original term",
    "translation": "approved Russian translation",
    "category": "person | title | organization | location | technique | item | other"
  }
]

Rules:
- Extract only terminology, names, organizations, titles, techniques, items, locations.
- Ignore common vocabulary.
- Keep the original source-language term in "term".
- Keep the Russian translation in "translation".
- No markdown.
`.trim();

    const response = await this.generateContentWithRetry(
      {
        model: analysisModel,
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [{ text: text.slice(0, 120000) }] },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      },
      'Glossary extraction'
    );

    const parsed = this.cleanAndParseJson<RawGlossaryTerm[]>(response.text || '', []);

    return parsed
      .filter((item) => item.term && item.translation)
      .map((item) =>
        createGlossaryItem(
          String(item.term).trim(),
          String(item.translation).trim(),
          'auto',
          item.category ?? 'other',
          null
        )
      );
  }

  async translateChapterChunk(payload: TranslateChunkPayload): Promise<string> {
    const response = await this.generateContentWithRetry(
      {
        model: payload.translationModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: this.buildTranslationSystemInstruction(
                  payload.systemPrompt,
                  payload.glossary,
                  payload.previousChapterContext
                ),
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                text: `
Translate chapter part ${payload.chunkIndex + 1} of ${payload.totalChunks}.
${payload.chunkIndex > 0 ? 'Continue seamlessly from the earlier translated part of the same chapter.' : 'Start the chapter naturally.'}
Do not repeat previous parts. Do not add commentary.

PREVIOUS TRANSLATED EXCERPT FROM EARLIER IN THIS CHAPTER:
${this.buildCurrentChapterExcerpt(payload.previousTranslatedExcerpt)}

SOURCE TEXT:
${payload.chunkText}
`.trim(),
              },
            ],
          },
        ],
        config: {
          temperature: 0.25,
        },
      },
      `Translation chunk ${payload.chunkIndex + 1}/${payload.totalChunks}`
    );

    return (response.text || '').trim();
  }

  async runChapterControlPass(payload: ChapterControlPassPayload): Promise<ChapterControlResult> {
    const response = await this.generateContentWithRetry(
      {
        model: payload.analysisModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `
You are a post-translation controller for a long-running web-novel localization project.

Return JSON only with this exact shape:
{
  "consistencyNotes": ["note 1", "note 2"],
  "normalizedTranslation": "full Russian chapter text with terminology normalized",
  "newTerms": [
    {
      "term": "original term",
      "suggestedTranslation": "russian translation",
      "context": "short source context",
      "category": "person | title | organization | location | technique | item | other",
      "confidence": 0.0
    }
  ]
}

Rules:
- Focus on names, titles, factions, locations, techniques, skills, weapons, artifacts, organizations, and unique items.
- Never add common verbs, adjectives, or everyday nouns as glossary terms.
- If you are unsure, lower confidence.
- normalizedTranslation must contain the full Russian chapter text, preserving paragraph breaks and literary flow.
- Use approved glossary terms exactly, allowing only necessary Russian inflection.
- Do not reorder approved term wording or replace it with synonyms.
- If you identify a new stable term, normalize the Russian chapter so the same suggestedTranslation is used consistently there.
- Use the previous translated chapter only as continuity context across the chapter boundary.
- consistencyNotes should mention glossary drift or naming instability if found.
- Source language profile: ${payload.profile}.
- File name: ${payload.fileName}. Chapter id: ${payload.chapterId}.

Approved glossary:
${this.buildGlossaryBlock(payload.glossary)}

Previous translated chapter context:
${this.buildPreviousChapterExcerpt(payload.previousChapterContext)}

SOURCE TEXT:
${payload.sourceText.slice(0, 90000)}

TRANSLATED TEXT:
${payload.translatedText.slice(0, 90000)}
`.trim(),
              },
            ],
          },
        ],
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      },
      `Chapter control pass for ${payload.fileName}`
    );

    const parsed = this.cleanAndParseJson<{
      consistencyNotes?: string[];
      normalizedTranslation?: string;
      newTerms?: RawNewTerm[];
    }>(response.text || '', {
      consistencyNotes: [],
      normalizedTranslation: '',
      newTerms: [],
    });

    const newTerms: NewTermDiscovery[] = (parsed.newTerms || [])
      .filter((item) => item.term && item.suggestedTranslation && item.context)
      .map((item) =>
        createDiscoveredTermDecision(
          {
            term: String(item.term).trim(),
            suggestedTranslation: String(item.suggestedTranslation).trim(),
            context: String(item.context).trim(),
            category: item.category ?? 'other',
            confidence: item.confidence ?? 0,
            chapterId: payload.chapterId,
          },
          payload.glossary
        )
      );

    return {
      newTerms,
      normalizedTranslation: (parsed.normalizedTranslation || '').trim(),
      consistencyNotes: Array.isArray(parsed.consistencyNotes)
        ? parsed.consistencyNotes.map((note) => String(note).trim()).filter(Boolean)
        : [],
    };
  }

  async lookupOriginalTerm(
    payload: LookupOriginalTermPayload
  ): Promise<{ term: string; sentence: string }> {
    const response = await this.generateContentWithRetry(
      {
        model: payload.analysisModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `
Return JSON only:
{ "term": "original term", "sentence": "original sentence" }

The user selected this text from the Russian translation:
"${payload.selectedText}"

Find the matching source term and the corresponding original sentence.

ORIGINAL CHAPTER:
${payload.originalChapterText.slice(0, 100000)}

TRANSLATED CHAPTER:
${payload.translatedChapterText.slice(0, 100000)}
`.trim(),
              },
            ],
          },
        ],
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      },
      'Original-term lookup'
    );

    return this.cleanAndParseJson<{ term: string; sentence: string }>(response.text || '', {
      term: '',
      sentence: '',
    });
  }
}
