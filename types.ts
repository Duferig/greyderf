export type LanguageProfile = 'korean' | 'chinese' | 'english';

export type TermCategory =
  | 'person'
  | 'title'
  | 'organization'
  | 'location'
  | 'technique'
  | 'item'
  | 'other';

export type TermSource = 'manual' | 'auto';
export type GlossaryStatus = 'approved';
export type TermDecision = 'auto_added' | 'queued' | 'rejected';
export type ChapterJobStatus = 'pending' | 'translating' | 'completed' | 'error';

export interface GlossaryItem {
  term: string;
  translation: string;
  status: GlossaryStatus;
  source: TermSource;
  category: TermCategory;
  chapterId: number | null;
  updatedAt: string;
}

export interface NewTermDiscovery {
  id: string;
  term: string;
  context: string;
  suggestedTranslation: string;
  category: TermCategory;
  confidence: number;
  chapterId: number;
  conflictWith: string | null;
  decision: TermDecision;
}

export interface ChapterJob {
  id: number;
  fileName: string;
  order: number;
  status: ChapterJobStatus;
  sourceText: string;
  translatedText: string;
  outputFileName: string;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  consistencyNotes: string[];
}

export interface ModelConfig {
  translationModel: string;
  analysisModel: string;
}

export interface ProjectState {
  sourceFolderName: string;
  outputFolderName: string;
  chapterJobs: ChapterJob[];
  approvedGlossary: GlossaryItem[];
  reviewQueue: NewTermDiscovery[];
  activeModelConfig: ModelConfig;
  languageProfile: LanguageProfile;
  systemPrompt: string;
  selectedChapterId: number | null;
  completedCount: number;
  lastSavedAt: string | null;
}
