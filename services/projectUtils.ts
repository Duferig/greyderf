import {
  ChapterJob,
  GlossaryItem,
  NewTermDiscovery,
  TermCategory,
  TermDecision,
  TermSource,
} from '../types';

const DEFAULT_AUTO_ADD_THRESHOLD = 0.85;
const COMMON_TRANSLATION_WORDS = new Set([
  'жить',
  'жизнь',
  'живет',
  'живой',
  'идти',
  'пойти',
  'сказать',
  'говорить',
  'рука',
  'голова',
  'глаза',
  'ночь',
  'день',
  'человек',
  'женщина',
  'мужчина',
  'ребенок',
  'live',
  'life',
  'go',
  'come',
  'look',
  'say',
  'man',
  'woman',
  'boy',
  'girl',
  'day',
  'night',
]);

const ALLOWED_AUTO_CATEGORIES: TermCategory[] = [
  'person',
  'title',
  'organization',
  'location',
  'technique',
  'item',
];

export const DEFAULT_MODEL_CONFIG = {
  translationModel: 'gemma-4-31b-it',
  analysisModel: 'gemma-4-31b-it',
};

export const extractFirstNumber = (fileName: string): number | null => {
  const match = fileName.match(/\d+/);
  return match ? Number(match[0]) : null;
};

export const sortChapterFileNames = (fileNames: string[]): string[] => {
  return [...fileNames].sort((left, right) => {
    const leftNumber = extractFirstNumber(left);
    const rightNumber = extractFirstNumber(right);

    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    if (leftNumber !== null && rightNumber === null) return -1;
    if (leftNumber === null && rightNumber !== null) return 1;

    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  });
};

export const buildChapterJobs = (fileNames: string[]): ChapterJob[] => {
  return sortChapterFileNames(fileNames).map((fileName, index) => ({
    id: index + 1,
    fileName,
    order: index + 1,
    status: 'pending',
    sourceText: '',
    translatedText: '',
    outputFileName: fileName,
    error: null,
    startedAt: null,
    completedAt: null,
    retryCount: 0,
    consistencyNotes: [],
  }));
};

export const splitChapterIntoChunks = (text: string, maxChars = 18000): string[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentChunk = '';

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
  };

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

    const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      pushChunk(currentChunk);
      currentChunk = '';
    }

    if (paragraph.length <= maxChars) {
      currentChunk = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChars) {
      pushChunk(paragraph.slice(index, index + maxChars));
    }
  }

  pushChunk(currentChunk);
  return chunks;
};

export const createGlossaryItem = (
  term: string,
  translation: string,
  source: TermSource,
  category: TermCategory = 'other',
  chapterId: number | null = null
): GlossaryItem => ({
  term,
  translation,
  status: 'approved',
  source,
  category,
  chapterId,
  updatedAt: new Date().toISOString(),
});

export const normalizeGlossaryItems = (items: Array<Partial<GlossaryItem>>): GlossaryItem[] => {
  const seen = new Set<string>();
  const normalized: GlossaryItem[] = [];

  for (const item of items) {
    const term = `${item.term ?? ''}`.trim();
    const translation = `${item.translation ?? ''}`.trim();
    if (!term || !translation) continue;

    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      term,
      translation,
      status: 'approved',
      source: item.source ?? 'manual',
      category: item.category ?? 'other',
      chapterId: item.chapterId ?? null,
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    });
  }

  return normalized;
};

export const mergeApprovedGlossary = (
  current: GlossaryItem[],
  incoming: GlossaryItem[]
): GlossaryItem[] => {
  return normalizeGlossaryItems([...current, ...incoming]);
};

export const detectGlossaryConflict = (
  approvedGlossary: GlossaryItem[],
  term: string,
  translation: string
): string | null => {
  const existing = approvedGlossary.find(
    (item) => item.term.trim().toLocaleLowerCase() === term.trim().toLocaleLowerCase()
  );

  if (!existing) return null;
  if (existing.translation.trim() === translation.trim()) return null;
  return existing.translation;
};

export const normalizeConfidence = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 1) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
};

export const passesCommonWordFilter = (term: string, translation: string): boolean => {
  const normalizedTerm = term.trim().toLocaleLowerCase();
  const normalizedTranslation = translation.trim().toLocaleLowerCase();

  return (
    !COMMON_TRANSLATION_WORDS.has(normalizedTerm) &&
    !COMMON_TRANSLATION_WORDS.has(normalizedTranslation)
  );
};

export const shouldAutoAddTerm = (
  candidate: NewTermDiscovery,
  approvedGlossary: GlossaryItem[]
): boolean => {
  if (!ALLOWED_AUTO_CATEGORIES.includes(candidate.category)) return false;
  if (candidate.confidence < DEFAULT_AUTO_ADD_THRESHOLD) return false;
  if (!passesCommonWordFilter(candidate.term, candidate.suggestedTranslation)) return false;

  const normalizedTerm = candidate.term.trim().toLocaleLowerCase();
  if (!normalizedTerm) return false;

  const existing = approvedGlossary.find(
    (item) => item.term.trim().toLocaleLowerCase() === normalizedTerm
  );

  if (!existing) return !candidate.conflictWith;
  return existing.translation.trim() === candidate.suggestedTranslation.trim();
};

export const createDiscoveredTermDecision = (
  candidate: Omit<NewTermDiscovery, 'id' | 'decision' | 'conflictWith' | 'confidence'> & {
    confidence: unknown;
  },
  approvedGlossary: GlossaryItem[]
): NewTermDiscovery => {
  const conflictWith = detectGlossaryConflict(
    approvedGlossary,
    candidate.term,
    candidate.suggestedTranslation
  );

  const normalizedCandidate: NewTermDiscovery = {
    id: `${candidate.chapterId}:${candidate.term.trim().toLocaleLowerCase()}:${candidate.context
      .trim()
      .toLocaleLowerCase()}`,
    term: candidate.term.trim(),
    context: candidate.context.trim(),
    suggestedTranslation: candidate.suggestedTranslation.trim(),
    category: candidate.category,
    confidence: normalizeConfidence(candidate.confidence),
    chapterId: candidate.chapterId,
    conflictWith,
    decision: 'queued',
  };

  normalizedCandidate.decision = shouldAutoAddTerm(normalizedCandidate, approvedGlossary)
    ? 'auto_added'
    : ('queued' as TermDecision);

  return normalizedCandidate;
};
