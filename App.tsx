import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mammoth from 'mammoth';
import GlossaryPanel from './components/GlossaryPanel';
import TranslationView from './components/TranslationView';
import ChapterQueuePanel from './components/ChapterQueuePanel';
import { GeminiService } from './services/geminiService';
import {
  areSameDirectoryHandles,
  deleteFileFromDirectoryIfExists,
  ensureHandlePermission,
  isDirectoryPickerSupported,
  listChapterFiles,
  pickDirectory,
  readOutputFileIfExists,
  readTextFileFromDirectory,
  writeTextFileToDirectory,
} from './services/fileSystemService';
import {
  loadDirectoryHandles,
  loadPersistedProject,
  saveDirectoryHandle,
  savePersistedProject,
} from './services/projectStorage';
import {
  buildChapterJobs,
  createGlossaryItem,
  DEFAULT_MODEL_CONFIG,
  mergeApprovedGlossary,
  normalizeGlossaryItems,
  splitChapterIntoChunks,
} from './services/projectUtils';
import {
  ChapterJob,
  GlossaryItem,
  LanguageProfile,
  ProjectState,
} from './types';

const PROMPTS: Record<LanguageProfile, string> = {
  korean: `# СИСТЕМНАЯ ИНСТРУКЦИЯ: ЭЛИТНЫЙ ЛОКАЛИЗАТОР MURIM

Ты — элитный литературный переводчик корейских веб-новелл на русский язык.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Переводи полностью, без сокращений, пропусков и пересказа.
2. Соблюдай единый стиль терминов, имен, организаций, техник и титулов.
3. Не оставляй оригинал в скобках без необходимости.
4. Делай русский текст живым и литературным, без канцелярита.
5. Сохраняй структуру заголовков глав и важные форматные маркеры.`,
  chinese: `# СИСТЕМНАЯ ИНСТРУКЦИЯ: ЭЛИТНЫЙ ЛОКАЛИЗАТОР XIANXIA/WUXIA

Ты — элитный литературный переводчик китайских веб-новелл на русский язык.

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Переводи весь текст без сокращений и упрощений.
2. Не делай пересказ вместо перевода.
3. Имена, секты, ранги, техники и артефакты должны быть единообразны.
4. Русский текст должен звучать естественно и динамично.
5. Заголовки глав всегда переводи на русский.`,
  english: `# SYSTEM INSTRUCTION: LITERARY RUSSIAN TRANSLATOR

You are a high-quality literary translator working from English into Russian.

CRITICAL RULES:
1. Translate every sentence with full fidelity.
2. Never summarize, compress, or paraphrase away important details.
3. Keep naming, items, titles, places, and techniques consistent.
4. Produce natural literary Russian, not flat literal translation.
5. Preserve chapter headings and scene structure.`,
};

const DEFAULT_PROFILE: LanguageProfile = 'korean';

const createEmptyProjectState = (
  languageProfile: LanguageProfile = DEFAULT_PROFILE,
  systemPrompt: string = PROMPTS[DEFAULT_PROFILE]
): ProjectState => ({
  sourceFolderName: '',
  outputFolderName: '',
  chapterJobs: [],
  approvedGlossary: [],
  reviewQueue: [],
  activeModelConfig: DEFAULT_MODEL_CONFIG,
  languageProfile,
  systemPrompt,
  selectedChapterId: null,
  completedCount: 0,
  lastSavedAt: null,
});

const createPersistableProjectState = (projectState: ProjectState): ProjectState => ({
  ...projectState,
  chapterJobs: projectState.chapterJobs.map((job) => ({
    ...job,
    sourceText: '',
    translatedText: '',
  })),
});

const countCompletedJobs = (jobs: ChapterJob[]): number => {
  return jobs.filter((job) => job.status === 'completed').length;
};

const readImportedTextFile = async (file: File): Promise<string> => {
  if (file.name.toLowerCase().endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  return file.text();
};

function App() {
  const [project, setProject] = useState<ProjectState>(() =>
    createEmptyProjectState(DEFAULT_PROFILE, PROMPTS[DEFAULT_PROFILE])
  );
  const [profile, setProfile] = useState<LanguageProfile>(DEFAULT_PROFILE);
  const [systemPrompt, setSystemPrompt] = useState<string>(PROMPTS[DEFAULT_PROFILE]);
  const [sourceDirectoryHandle, setSourceDirectoryHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [outputDirectoryHandle, setOutputDirectoryHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isExtractingGlossary, setIsExtractingGlossary] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runMode, setRunMode] = useState<'idle' | 'single' | 'all'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>(
    'Pick a source folder and an output folder to start the batch translator.'
  );

  const projectRef = useRef(project);
  const gemini = useRef(new GeminiService());
  const glossaryInputRef = useRef<HTMLInputElement>(null);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const applyProjectUpdate = useCallback((updater: (current: ProjectState) => ProjectState) => {
    setProject((current) => {
      const next = updater(current);
      const nextWithMeta = {
        ...next,
        completedCount: countCompletedJobs(next.chapterJobs),
        lastSavedAt: new Date().toISOString(),
      };
      projectRef.current = nextWithMeta;
      return nextWithMeta;
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const restore = async () => {
      try {
        const [savedProject, handles] = await Promise.all([
          loadPersistedProject(),
          loadDirectoryHandles(),
        ]);

        if (isCancelled) return;

        if (savedProject) {
          const normalizedProject: ProjectState = {
            ...createEmptyProjectState(savedProject.languageProfile, savedProject.systemPrompt),
            ...savedProject,
            activeModelConfig: DEFAULT_MODEL_CONFIG,
          };

          setProject(normalizedProject);
          projectRef.current = normalizedProject;
          setProfile(normalizedProject.languageProfile);
          setSystemPrompt(normalizedProject.systemPrompt);
          setStatusMessage('Restored your saved local translation project.');
        }

        setSourceDirectoryHandle(handles.sourceHandle);
        setOutputDirectoryHandle(handles.outputHandle);
      } catch (error) {
        console.error('Failed to restore persisted state', error);
        if (!isCancelled) {
          setStatusMessage('Could not restore the saved local project state.');
        }
      } finally {
        if (!isCancelled) {
          setIsHydrated(true);
        }
      }
    };

    restore();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const timeoutId = window.setTimeout(() => {
      savePersistedProject(createPersistableProjectState(projectRef.current)).catch((error) => {
        console.error('Failed to persist project state', error);
      });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [project, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveDirectoryHandle('source', sourceDirectoryHandle).catch((error) => {
      console.error('Failed to persist source directory handle', error);
    });
  }, [sourceDirectoryHandle, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveDirectoryHandle('output', outputDirectoryHandle).catch((error) => {
      console.error('Failed to persist output directory handle', error);
    });
  }, [outputDirectoryHandle, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !outputDirectoryHandle) return;

    const timeoutId = window.setTimeout(() => {
      areSameDirectoryHandles(sourceDirectoryHandle, outputDirectoryHandle)
        .then((sameDirectory) => {
          if (sameDirectory) return;

          const glossarySnapshot = JSON.stringify(
            normalizeGlossaryItems(projectRef.current.approvedGlossary),
            null,
            2
          );

          return writeTextFileToDirectory(
            outputDirectoryHandle,
            'approved-glossary.json',
            glossarySnapshot
          );
        })
        .catch((error) => {
          console.warn('Failed to persist output artifacts', error);
        });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    isHydrated,
    outputDirectoryHandle,
    project.approvedGlossary,
    sourceDirectoryHandle,
  ]);

  const selectedChapter = useMemo(() => {
    return (
      project.chapterJobs.find((chapter) => chapter.id === project.selectedChapterId) ?? null
    );
  }, [project.chapterJobs, project.selectedChapterId]);

  const approvedGlossary = useMemo(() => {
    return project.approvedGlossary.filter(
      (item) => item.term.trim().length > 0 && item.translation.trim().length > 0
    );
  }, [project.approvedGlossary]);

  const loadPreviousChapterContext = useCallback(
    async (chapter: ChapterJob): Promise<{ fileName: string; translatedText: string } | null> => {
      if (!outputDirectoryHandle) return null;

      const previousChapter = [...projectRef.current.chapterJobs]
        .filter((job) => job.order < chapter.order)
        .sort((left, right) => right.order - left.order)[0];

      if (!previousChapter) return null;

      let translatedText = previousChapter.translatedText.trim();

      if (!translatedText && previousChapter.status === 'completed') {
        try {
          translatedText =
            (await readOutputFileIfExists(outputDirectoryHandle, previousChapter.outputFileName)) ||
            '';
          translatedText = translatedText.trim();
        } catch (error) {
          console.warn(`Failed loading previous chapter context for ${chapter.fileName}`, error);
        }
      }

      if (!translatedText) return null;

      return {
        fileName: previousChapter.fileName,
        translatedText,
      };
    },
    [outputDirectoryHandle]
  );

  const ensureChapterPreviewLoaded = useCallback(
    async (
      chapterId: number,
      options?: {
        directoryHandle?: FileSystemDirectoryHandle | null;
        forceSourceRead?: boolean;
        forceTranslatedRead?: boolean;
      }
    ) => {
      const chapter = projectRef.current.chapterJobs.find((item) => item.id === chapterId);
      const activeSourceDirectoryHandle = options?.directoryHandle ?? sourceDirectoryHandle;
      if (!chapter || !activeSourceDirectoryHandle) return;

      try {
        let sourceText = chapter.sourceText;
        let translatedText = chapter.translatedText;

        if (options?.forceSourceRead || !sourceText) {
          const granted = await ensureHandlePermission(activeSourceDirectoryHandle, 'read');
          if (!granted) {
            setStatusMessage('Source folder permission is required to read chapter files.');
            return;
          }
          sourceText = await readTextFileFromDirectory(activeSourceDirectoryHandle, chapter.fileName);
        }

        if (
          (options?.forceTranslatedRead || !translatedText) &&
          outputDirectoryHandle &&
          chapter.status === 'completed'
        ) {
          const granted = await ensureHandlePermission(outputDirectoryHandle, 'read');
          if (granted) {
            translatedText =
              (await readOutputFileIfExists(outputDirectoryHandle, chapter.outputFileName)) || '';
          }
        }

        applyProjectUpdate((current) => ({
          ...current,
          ...(current.selectedChapterId === chapterId ? {} : { selectedChapterId: chapterId }),
          chapterJobs: current.chapterJobs.map((job) => {
            if (job.id !== chapterId) return job;
            if (
              job.sourceText === sourceText &&
              job.translatedText === translatedText &&
              current.selectedChapterId === chapterId
            ) {
              return job;
            }
            return { ...job, sourceText, translatedText };
          }),
        }));
      } catch (error) {
        console.error('Failed loading chapter preview', error);
        setStatusMessage(`Could not load preview for ${chapter.fileName}.`);
      }
    },
    [applyProjectUpdate, outputDirectoryHandle, sourceDirectoryHandle]
  );

  const handleSelectChapter = useCallback(
    (chapterId: number) => {
      applyProjectUpdate((current) => ({
        ...current,
        selectedChapterId: chapterId,
      }));
    },
    [applyProjectUpdate]
  );

  useEffect(() => {
    if (!project.selectedChapterId || !sourceDirectoryHandle) return;

    const selectedJob = project.chapterJobs.find(
      (chapter) => chapter.id === project.selectedChapterId
    );
    if (!selectedJob) return;

    const needsSourceText = !selectedJob.sourceText;
    const needsTranslatedText = selectedJob.status === 'completed' && !selectedJob.translatedText;

    if (!needsSourceText && !needsTranslatedText) {
      return;
    }

    ensureChapterPreviewLoaded(project.selectedChapterId);
  }, [ensureChapterPreviewLoaded, project.chapterJobs, project.selectedChapterId, sourceDirectoryHandle]);

  const handleProfileChange = (nextProfile: LanguageProfile) => {
    const nextPrompt = PROMPTS[nextProfile];
    setProfile(nextProfile);
    setSystemPrompt(nextPrompt);
    applyProjectUpdate((current) => ({
      ...current,
      languageProfile: nextProfile,
      systemPrompt: nextPrompt,
    }));
  };

  const handlePromptChange = (value: string) => {
    setSystemPrompt(value);
    applyProjectUpdate((current) => ({
      ...current,
      systemPrompt: value,
    }));
  };

  const handleGlossaryImportClick = () => {
    glossaryInputRef.current?.click();
  };

  const handleGlossaryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsExtractingGlossary(true);

    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const raw = JSON.parse(await file.text());
        const imported = Array.isArray(raw) ? normalizeGlossaryItems(raw) : [];
        applyProjectUpdate((current) => ({
          ...current,
          approvedGlossary: mergeApprovedGlossary(current.approvedGlossary, imported),
        }));
        setStatusMessage(`Imported ${imported.length} glossary entries from JSON.`);
      } else {
        const text = await readImportedTextFile(file);
        const extracted = await gemini.current.extractGlossary(
          text,
          projectRef.current.activeModelConfig.analysisModel
        );

        applyProjectUpdate((current) => ({
          ...current,
          approvedGlossary: mergeApprovedGlossary(current.approvedGlossary, extracted),
        }));
        setStatusMessage(`Extracted ${extracted.length} glossary entries with AI.`);
      }
    } catch (error) {
      console.error('Failed importing glossary', error);
      setStatusMessage('Glossary import failed.');
    } finally {
      setIsExtractingGlossary(false);
      event.target.value = '';
    }
  };

  const pickSourceFolder = async () => {
    if (!isDirectoryPickerSupported()) {
      setStatusMessage(
        'This workflow needs Chrome or Edge because it depends on the File System Access API.'
      );
      return;
    }

    try {
      const handle = await pickDirectory();
      const granted = await ensureHandlePermission(handle, 'read');
      if (!granted) {
        setStatusMessage('Source folder permission was not granted.');
        return;
      }

      if (await areSameDirectoryHandles(handle, outputDirectoryHandle)) {
        setStatusMessage(
          'Source and output folders must be different, otherwise translated files overwrite the originals.'
        );
        return;
      }

      const isSameSourceDirectory = await areSameDirectoryHandles(handle, sourceDirectoryHandle);

      const fileNames = await listChapterFiles(handle);
      if (fileNames.length === 0) {
        setStatusMessage('No .txt or .md chapter files were found in the selected folder.');
        return;
      }

      const existingByFileName = new Map(
        projectRef.current.chapterJobs.map((chapter) => [chapter.fileName, chapter])
      );
      const previouslySelectedFileName = projectRef.current.chapterJobs.find(
        (chapter) => chapter.id === projectRef.current.selectedChapterId
      )?.fileName;

      const chapterJobs = buildChapterJobs(fileNames).map((chapter) => {
        if (!isSameSourceDirectory) {
          return chapter;
        }

        const existing = existingByFileName.get(chapter.fileName);
        if (!existing) return chapter;

        return {
          ...chapter,
          ...existing,
          id: chapter.id,
          order: chapter.order,
          fileName: chapter.fileName,
          outputFileName: chapter.fileName,
        };
      });

      const selectedChapterId =
        (isSameSourceDirectory
          ? chapterJobs.find((chapter) => chapter.fileName === previouslySelectedFileName)?.id
          : null) ??
        chapterJobs[0]?.id ??
        null;

      setSourceDirectoryHandle(handle);
      applyProjectUpdate((current) => ({
        ...current,
        sourceFolderName: handle.name,
        chapterJobs,
        selectedChapterId,
        reviewQueue: [],
      }));
      setStatusMessage(
        isSameSourceDirectory
          ? `Loaded ${chapterJobs.length} chapters from "${handle.name}".`
          : `Loaded a new source folder "${handle.name}" and cleared chapter progress from the previous folder.`
      );

      if (selectedChapterId) {
        ensureChapterPreviewLoaded(selectedChapterId, {
          directoryHandle: handle,
          forceSourceRead: true,
          forceTranslatedRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to pick source folder', error);
      setStatusMessage('Source folder selection was cancelled or failed.');
    }
  };

  const pickOutputFolder = async () => {
    if (!isDirectoryPickerSupported()) {
      setStatusMessage(
        'This workflow needs Chrome or Edge because it depends on the File System Access API.'
      );
      return;
    }

    try {
      const handle = await pickDirectory();
      const granted = await ensureHandlePermission(handle, 'readwrite');
      if (!granted) {
        setStatusMessage('Output folder permission was not granted.');
        return;
      }

      if (await areSameDirectoryHandles(handle, sourceDirectoryHandle)) {
        setStatusMessage(
          'Output folder must be different from the source folder, otherwise original chapters get overwritten.'
        );
        return;
      }

      setOutputDirectoryHandle(handle);
      applyProjectUpdate((current) => ({
        ...current,
        outputFolderName: handle.name,
      }));
      setStatusMessage(`Output folder set to "${handle.name}".`);
    } catch (error) {
      console.error('Failed to pick output folder', error);
      setStatusMessage('Output folder selection was cancelled or failed.');
    }
  };

  const ensureTranslationEnvironment = async (): Promise<boolean> => {
    if (!(await gemini.current.isConfigured())) {
      setStatusMessage(
        'Gemini backend is not configured. Put GEMINI_API_KEY into the server environment and restart.'
      );
      return false;
    }

    if (!sourceDirectoryHandle || !outputDirectoryHandle) {
      setStatusMessage('Pick both the source folder and the output folder first.');
      return false;
    }

    if (await areSameDirectoryHandles(sourceDirectoryHandle, outputDirectoryHandle)) {
      setStatusMessage(
        'Source and output folders are the same. Pick a separate output folder before translating.'
      );
      return false;
    }

    const [sourceGranted, outputGranted] = await Promise.all([
      ensureHandlePermission(sourceDirectoryHandle, 'read'),
      ensureHandlePermission(outputDirectoryHandle, 'readwrite'),
    ]);

    if (!sourceGranted || !outputGranted) {
      setStatusMessage('Folder permissions are required before translation can continue.');
      return false;
    }

    return true;
  };

  const rebuildFinalFile = useCallback(async () => {
    if (!outputDirectoryHandle) {
      setStatusMessage('Pick an output folder before rebuilding the final file.');
      return;
    }

    const granted = await ensureHandlePermission(outputDirectoryHandle, 'readwrite');
    if (!granted) {
      setStatusMessage('Output folder permission is required to rebuild the final file.');
      return;
    }

    const sortedChapters = [...projectRef.current.chapterJobs].sort(
      (left, right) => left.order - right.order
    );
    const collected: string[] = [];

    for (const chapter of sortedChapters) {
      const translatedText = (
        (await readOutputFileIfExists(outputDirectoryHandle, chapter.outputFileName)) ||
        chapter.translatedText ||
        ''
      ).trim();

      if (translatedText) {
        collected.push(translatedText);
      }
    }

    await writeTextFileToDirectory(
      outputDirectoryHandle,
      'full_translation.txt',
      collected.join('\n\n')
    );
    setStatusMessage(`Rebuilt full_translation.txt from ${collected.length} translated chapter(s).`);
  }, [outputDirectoryHandle]);

  const translateChapterById = useCallback(
    async (chapterId: number) => {
      const chapter = projectRef.current.chapterJobs.find((item) => item.id === chapterId);
      if (!chapter || !sourceDirectoryHandle || !outputDirectoryHandle) return;

      const sourceText =
        chapter.sourceText ||
        (await readTextFileFromDirectory(sourceDirectoryHandle, chapter.fileName));
      const chunkTexts = splitChapterIntoChunks(sourceText);
      const previousChapterContext = await loadPreviousChapterContext(chapter);

      if (chunkTexts.length === 0) {
        throw new Error(`Chapter "${chapter.fileName}" is empty.`);
      }
      const currentGlossary = projectRef.current.approvedGlossary.filter(
        (item) => item.term.trim().length > 0 && item.translation.trim().length > 0
      );

      setProgress(0);
      setStatusMessage(`Translating ${chapter.fileName}...`);

      applyProjectUpdate((current) => ({
        ...current,
        selectedChapterId: chapterId,
        chapterJobs: current.chapterJobs.map((job) =>
          job.id === chapterId
            ? {
                ...job,
                sourceText,
                translatedText: '',
                status: 'translating',
                error: null,
                startedAt: new Date().toISOString(),
                consistencyNotes: [],
              }
            : job
        ),
      }));

      let translatedText = '';
      let processedChunks = 0;

      try {
        for await (const translatedChunk of gemini.current.translateChapterStream({
          chapterText: sourceText,
          glossary: currentGlossary,
          systemPrompt: projectRef.current.systemPrompt,
          previousChapterContext,
          translationModel: projectRef.current.activeModelConfig.translationModel,
          chunkTexts,
        })) {
          translatedText += translatedChunk;
          processedChunks += 1;
          setProgress((processedChunks / chunkTexts.length) * 88);

          applyProjectUpdate((current) => ({
            ...current,
            chapterJobs: current.chapterJobs.map((job) =>
              job.id === chapterId
                ? {
                    ...job,
                    sourceText,
                    translatedText,
                    status: 'translating',
                  }
                : job
            ),
          }));
        }

        const rawTranslatedText = translatedText.trim();
        setProgress(92);
        setStatusMessage(
          `Finalizing ${chapter.fileName}: normalizing terms and checking previous-chapter continuity...`
        );

        let postAutoGlossaryItems: GlossaryItem[] = [];
        let controlNotes: string[] = [];
        let finalText = rawTranslatedText;

        try {
          const control = await gemini.current.runChapterControlPass({
            chapterId,
            fileName: chapter.fileName,
            sourceText,
            translatedText: rawTranslatedText,
            glossary: currentGlossary,
            previousChapterContext,
            analysisModel: projectRef.current.activeModelConfig.analysisModel,
            profile: projectRef.current.languageProfile,
          });

          postAutoGlossaryItems = control.newTerms
            .filter((term) => term.decision === 'auto_added')
            .map((term) =>
              createGlossaryItem(
                term.term,
                term.suggestedTranslation,
                'auto',
                term.category,
                chapterId
              )
            );

          controlNotes = control.consistencyNotes;
          finalText = control.normalizedTranslation || rawTranslatedText;
        } catch (error) {
          console.warn(`Post-translation control pass failed for ${chapter.fileName}`, error);
          controlNotes = ['Post-translation control pass failed; saved the raw translated chapter.'];
        }

        const finalGlossary = mergeApprovedGlossary(currentGlossary, postAutoGlossaryItems);

        setProgress(96);
        await writeTextFileToDirectory(outputDirectoryHandle, chapter.outputFileName, finalText);

        applyProjectUpdate((current) => {
          const mergedGlossary = mergeApprovedGlossary(
            current.approvedGlossary,
            postAutoGlossaryItems
          );

          return {
            ...current,
            approvedGlossary: mergedGlossary,
            reviewQueue: [],
            chapterJobs: current.chapterJobs.map((job) =>
              job.id === chapterId
                ? {
                    ...job,
                    sourceText,
                    translatedText: finalText,
                    status: 'completed',
                    error: null,
                    completedAt: new Date().toISOString(),
                    consistencyNotes: controlNotes,
                  }
                : job
            ),
          };
        });
        setProgress(100);

        setStatusMessage(
          `Translated ${chapter.fileName}. Auto-added ${postAutoGlossaryItems.length} term(s).`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown translation error.';
        console.error('Chapter translation failed', error);

        applyProjectUpdate((current) => ({
          ...current,
          chapterJobs: current.chapterJobs.map((job) =>
            job.id === chapterId
              ? {
                  ...job,
                  sourceText,
                  translatedText,
                  status: 'error',
                  error: message,
                  retryCount: job.retryCount + 1,
                }
              : job
          ),
        }));

        setStatusMessage(`Translation failed for ${chapter.fileName}: ${message}`);
        throw error;
      }
    },
    [applyProjectUpdate, loadPreviousChapterContext, outputDirectoryHandle, sourceDirectoryHandle]
  );

  const translateSelectedChapter = async () => {
    if (!project.selectedChapterId) {
      setStatusMessage('Pick a chapter first.');
      return;
    }

    const canRun = await ensureTranslationEnvironment();
    if (!canRun) return;

    stopRequestedRef.current = false;
    setRunMode('single');
    setIsTranslating(true);

    try {
      await translateChapterById(project.selectedChapterId);
    } catch {
      // Per-chapter error state is already recorded.
    } finally {
      setIsTranslating(false);
      setRunMode('idle');
      setProgress(0);
    }
  };

  const translateAllRemaining = async () => {
    const canRun = await ensureTranslationEnvironment();
    if (!canRun) return;

    const remainingChapterIds = projectRef.current.chapterJobs
      .filter((chapter) => chapter.status !== 'completed')
      .sort((left, right) => left.order - right.order)
      .map((chapter) => chapter.id);

    if (remainingChapterIds.length === 0) {
      setStatusMessage('All chapters are already completed. Rebuilding the final file instead.');
      await rebuildFinalFile();
      return;
    }

    stopRequestedRef.current = false;
    setRunMode('all');
    setIsTranslating(true);

    try {
      for (const chapterId of remainingChapterIds) {
        if (stopRequestedRef.current) break;
        await translateChapterById(chapterId);
      }

      if (!stopRequestedRef.current) {
        await rebuildFinalFile();
      }
    } catch {
      // The failing chapter already stores error details.
    } finally {
      setIsTranslating(false);
      setRunMode('idle');
      setProgress(0);
      stopRequestedRef.current = false;
    }
  };

  const stopAfterCurrentChapter = () => {
    stopRequestedRef.current = true;
    setStatusMessage('The batch will stop after the current chapter finishes.');
  };

  const resetBatchProgress = async () => {
    if (isTranslating) return;

    stopRequestedRef.current = false;
    setProgress(0);
    setRunMode('idle');

    const current = projectRef.current;
    const preservedGlossary = normalizeGlossaryItems(current.approvedGlossary);
    const firstChapterId = current.chapterJobs[0]?.id ?? current.selectedChapterId ?? null;

    const nextProject: ProjectState = {
      ...current,
      approvedGlossary: preservedGlossary,
      reviewQueue: [],
      selectedChapterId: firstChapterId,
      chapterJobs: current.chapterJobs.map((job) => ({
        ...job,
        translatedText: '',
        status: 'pending',
        error: null,
        startedAt: null,
        completedAt: null,
        retryCount: 0,
        consistencyNotes: [],
      })),
      completedCount: 0,
      lastSavedAt: new Date().toISOString(),
    };

    projectRef.current = nextProject;
    setProject(nextProject);

    try {
      await savePersistedProject(createPersistableProjectState(nextProject));
    } catch (error) {
      console.warn('Failed to persist reset project state', error);
    }

    if (outputDirectoryHandle) {
      try {
        const granted = await ensureHandlePermission(outputDirectoryHandle, 'readwrite');
        if (granted) {
          const sameDirectory = await areSameDirectoryHandles(
            sourceDirectoryHandle,
            outputDirectoryHandle
          );

          if (!sameDirectory) {
            await Promise.all([
              ...nextProject.chapterJobs.map((job) =>
                deleteFileFromDirectoryIfExists(outputDirectoryHandle, job.outputFileName)
              ),
              deleteFileFromDirectoryIfExists(outputDirectoryHandle, 'full_translation.txt'),
              deleteFileFromDirectoryIfExists(outputDirectoryHandle, 'review-queue.json'),
            ]);

            await writeTextFileToDirectory(
              outputDirectoryHandle,
              'approved-glossary.json',
              JSON.stringify(preservedGlossary, null, 2)
            );
          }
        }
      } catch (error) {
        console.warn('Failed to clean output directory during reset', error);
      }
    }

    if (firstChapterId) {
      await ensureChapterPreviewLoaded(firstChapterId);
    }

    setStatusMessage(
      'Batch progress was reset. Glossary was preserved, output chapter files were cleared, and the queue starts again from chapter 1.'
    );
  };

  const handleLookupTerm = async (chapterId: number, selectedText: string) => {
    const chapter = projectRef.current.chapterJobs.find((item) => item.id === chapterId);
    if (!chapter) {
      return { term: '', sentence: '' };
    }

    const sourceText =
      chapter.sourceText ||
      (sourceDirectoryHandle
        ? await readTextFileFromDirectory(sourceDirectoryHandle, chapter.fileName)
        : '');

    return gemini.current.lookupOriginalTerm({
      selectedText,
      translatedChapterText: chapter.translatedText,
      originalChapterText: sourceText,
      analysisModel: projectRef.current.activeModelConfig.analysisModel,
    });
  };

  const errorCount = project.chapterJobs.filter((chapter) => chapter.status === 'error').length;

  return (
    <div className="min-h-screen text-gray-200 font-sans selection:bg-primary-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-cyan-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-primary-500/20">
                NT
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight text-white">NovelTranslator Batch</h1>
                <p className="text-xs text-gray-400">
                  Local Chrome/Edge workflow for chapter queues, persistent glossary, and long runs.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={pickSourceFolder}
                className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition"
              >
                Source Folder
              </button>
              <button
                onClick={pickOutputFolder}
                className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition"
              >
                Output Folder
              </button>
              <button
                onClick={handleGlossaryImportClick}
                className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition"
              >
                Import Glossary
              </button>
              <button
                onClick={translateSelectedChapter}
                disabled={isTranslating || !project.selectedChapterId}
                className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-bold transition"
              >
                Translate Selected
              </button>
              <button
                onClick={translateAllRemaining}
                disabled={isTranslating || project.chapterJobs.length === 0}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-bold transition"
              >
                Translate All Remaining
              </button>
              {isTranslating && runMode === 'all' && (
                <button
                  onClick={stopAfterCurrentChapter}
                  className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 rounded-lg font-bold transition"
                >
                  Stop After Current
                </button>
              )}
              <button
                onClick={rebuildFinalFile}
                disabled={isTranslating || project.completedCount === 0}
                className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg transition"
              >
                Rebuild `full_translation.txt`
              </button>
              <button
                onClick={resetBatchProgress}
                disabled={isTranslating || project.chapterJobs.length === 0}
                className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg font-bold transition"
              >
                Reset Progress
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-gray-850 border border-gray-700 rounded-lg px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">Source</div>
              <div className="text-gray-200 mt-1 break-all">
                {project.sourceFolderName || 'Not selected'}
              </div>
            </div>
            <div className="bg-gray-850 border border-gray-700 rounded-lg px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">Output</div>
              <div className="text-gray-200 mt-1 break-all">
                {project.outputFolderName || 'Not selected'}
              </div>
            </div>
            <div className="bg-gray-850 border border-gray-700 rounded-lg px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">Models</div>
              <div className="text-gray-200 mt-1 break-all">
                {project.activeModelConfig.translationModel}
                <br />
                <span className="text-gray-400">{project.activeModelConfig.analysisModel}</span>
              </div>
            </div>
            <div className="bg-gray-850 border border-gray-700 rounded-lg px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">Progress</div>
              <div className="text-gray-200 mt-1">
                {project.completedCount}/{project.chapterJobs.length} completed
                <br />
                <span className={errorCount > 0 ? 'text-red-300' : 'text-gray-400'}>
                  {errorCount} error chapter(s)
                </span>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-300 bg-gray-850 border border-gray-700 rounded-lg px-4 py-3">
            {statusMessage}
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        <aside className="xl:col-span-4 space-y-4">
          <div className="bg-gray-850 p-4 rounded-xl border border-gray-700 shadow-lg">
            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                Translation Profile
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => handleProfileChange('korean')}
                  className={`text-[10px] px-1.5 rounded uppercase tracking-wider border ${
                    profile === 'korean'
                      ? 'bg-blue-900/40 border-blue-500 text-blue-300'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  KR
                </button>
                <button
                  onClick={() => handleProfileChange('chinese')}
                  className={`text-[10px] px-1.5 rounded uppercase tracking-wider border ${
                    profile === 'chinese'
                      ? 'bg-red-900/40 border-red-500 text-red-300'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  CN
                </button>
                <button
                  onClick={() => handleProfileChange('english')}
                  className={`text-[10px] px-1.5 rounded uppercase tracking-wider border ${
                    profile === 'english'
                      ? 'bg-indigo-900/40 border-indigo-500 text-indigo-300'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            <textarea
              value={systemPrompt}
              onChange={(event) => handlePromptChange(event.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition resize-none h-44 text-gray-300 font-mono text-xs leading-relaxed"
              placeholder="System prompt instructions..."
            />
          </div>

          <ChapterQueuePanel
            chapters={project.chapterJobs}
            selectedChapterId={project.selectedChapterId}
            onSelectChapter={handleSelectChapter}
          />

          <GlossaryPanel
            glossary={project.approvedGlossary}
            setGlossary={(nextGlossary) =>
              applyProjectUpdate((current) => ({
                ...current,
                approvedGlossary: nextGlossary,
              }))
            }
            isExtracting={isExtractingGlossary}
            onImportGlossary={handleGlossaryImportClick}
          />
        </aside>

        <section className="xl:col-span-8">
          <TranslationView
            chapter={selectedChapter}
            isTranslating={isTranslating}
            progress={progress}
            onLookupTerm={handleLookupTerm}
          />
        </section>
      </main>

      <input
        type="file"
        ref={glossaryInputRef}
        onChange={handleGlossaryUpload}
        accept=".txt,.md,.json,.docx"
        className="hidden"
      />
    </div>
  );
}

export default App;
