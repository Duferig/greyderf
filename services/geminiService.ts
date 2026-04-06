import {
  ChapterControlPassPayload,
  ChapterControlResult,
  GeminiRpcRequest,
  GeminiRpcResponse,
  LookupOriginalTermPayload,
  PreviousChapterContext,
  TranslateChunkPayload,
} from '../geminiApi';
import { GlossaryItem } from '../types';

interface TranslateChapterOptions {
  chapterText: string;
  glossary: GlossaryItem[];
  systemPrompt: string;
  previousChapterContext: PreviousChapterContext | null;
  translationModel: string;
  chunkTexts: string[];
}

export class GeminiService {
  private configuredPromise: Promise<boolean> | null = null;

  private async callRpc<T>(request: GeminiRpcRequest): Promise<T> {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const payload = (await response.json().catch(() => null)) as GeminiRpcResponse<T> | null;

    if (!response.ok || !payload?.ok) {
      const errorMessage =
        payload && !payload.ok
          ? payload.error
          : `Gemini backend request failed with status ${response.status}.`;
      throw new Error(errorMessage);
    }

    return payload.data;
  }

  async isConfigured(): Promise<boolean> {
    if (!this.configuredPromise) {
      this.configuredPromise = this.callRpc<{ configured: boolean }>({ action: 'status' })
        .then((result) => result.configured)
        .catch(() => false);
    }

    return this.configuredPromise;
  }

  async extractGlossary(text: string, analysisModel: string): Promise<GlossaryItem[]> {
    return this.callRpc<GlossaryItem[]>({
      action: 'extractGlossary',
      payload: { text, analysisModel },
    });
  }

  async *translateChapterStream(options: TranslateChapterOptions): AsyncGenerator<string, void, unknown> {
    if (!options.chapterText.trim()) return;

    let previousTranslatedExcerpt = '';

    for (let index = 0; index < options.chunkTexts.length; index += 1) {
      const chunkText = options.chunkTexts[index];
      const translatedChunk = await this.callRpc<string>({
        action: 'translateChunk',
        payload: {
          glossary: options.glossary,
          systemPrompt: options.systemPrompt,
          previousChapterContext: options.previousChapterContext,
          translationModel: options.translationModel,
          chunkText,
          chunkIndex: index,
          totalChunks: options.chunkTexts.length,
          previousTranslatedExcerpt,
        } satisfies TranslateChunkPayload,
      });

      previousTranslatedExcerpt = `${previousTranslatedExcerpt}\n\n${translatedChunk}`.slice(-5000);

      if (translatedChunk.trim()) {
        yield translatedChunk.trimEnd() + (index < options.chunkTexts.length - 1 ? '\n\n' : '');
      }
    }
  }

  async runChapterControlPass(args: ChapterControlPassPayload): Promise<ChapterControlResult> {
    return this.callRpc<ChapterControlResult>({
      action: 'runChapterControlPass',
      payload: args,
    });
  }

  async lookupOriginalTerm(args: LookupOriginalTermPayload): Promise<{ term: string; sentence: string }> {
    return this.callRpc<{ term: string; sentence: string }>({
      action: 'lookupOriginalTerm',
      payload: args,
    });
  }
}
