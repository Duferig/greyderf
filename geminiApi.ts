import { GlossaryItem, LanguageProfile, NewTermDiscovery } from './types';

export interface PreviousChapterContext {
  fileName: string;
  translatedText: string;
}

export interface TranslateChunkPayload {
  glossary: GlossaryItem[];
  systemPrompt: string;
  previousChapterContext: PreviousChapterContext | null;
  translationModel: string;
  chunkText: string;
  chunkIndex: number;
  totalChunks: number;
  previousTranslatedExcerpt: string;
}

export interface ChapterControlPassPayload {
  chapterId: number;
  fileName: string;
  sourceText: string;
  translatedText: string;
  glossary: GlossaryItem[];
  previousChapterContext: PreviousChapterContext | null;
  analysisModel: string;
  profile: LanguageProfile;
}

export interface LookupOriginalTermPayload {
  selectedText: string;
  translatedChapterText: string;
  originalChapterText: string;
  analysisModel: string;
}

export interface ChapterControlResult {
  newTerms: NewTermDiscovery[];
  consistencyNotes: string[];
  normalizedTranslation: string;
}

export type GeminiRpcRequest =
  | { action: 'status' }
  | { action: 'extractGlossary'; payload: { text: string; analysisModel: string } }
  | { action: 'translateChunk'; payload: TranslateChunkPayload }
  | { action: 'runChapterControlPass'; payload: ChapterControlPassPayload }
  | { action: 'lookupOriginalTerm'; payload: LookupOriginalTermPayload };

export type GeminiRpcSuccessResponse<T> = {
  ok: true;
  data: T;
};

export type GeminiRpcErrorResponse = {
  ok: false;
  error: string;
};

export type GeminiRpcResponse<T> = GeminiRpcSuccessResponse<T> | GeminiRpcErrorResponse;
