import React, { useEffect, useRef, useState } from 'react';
import { ChapterJob } from '../types';

interface TranslationViewProps {
  chapter: ChapterJob | null;
  isTranslating: boolean;
  progress: number;
  onLookupTerm?: (chapterId: number, text: string) => Promise<{ term: string; sentence: string }>;
}

const TranslationView: React.FC<TranslationViewProps> = ({
  chapter,
  isTranslating,
  progress,
  onLookupTerm,
}) => {
  const translatedPaneRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    term: string;
    original: string | null;
    sentence: string | null;
    loading: boolean;
  }>({
    visible: false,
    x: 0,
    y: 0,
    term: '',
    original: null,
    sentence: null,
    loading: false,
  });

  useEffect(() => {
    if (isTranslating && translatedPaneRef.current) {
      translatedPaneRef.current.scrollTop = translatedPaneRef.current.scrollHeight;
    }
  }, [chapter?.translatedText, isTranslating]);

  const handleMouseUp = async () => {
    if (!chapter || !onLookupTerm) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      term: text,
      original: null,
      sentence: null,
      loading: true,
    });

    const result = await onLookupTerm(chapter.id, text);

    setTooltip((current) => {
      if (!current.visible || current.term !== text) return current;
      return {
        ...current,
        loading: false,
        original: result.term,
        sentence: result.sentence,
      };
    });
  };

  const closeTooltip = () => {
    setTooltip((current) => ({ ...current, visible: false }));
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="bg-gray-850 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-140px)] border border-gray-700 relative">
      <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 flex flex-wrap justify-between items-center gap-4 z-10">
        <div>
          <h2 className="text-xl font-serif text-gray-100">
            {chapter ? chapter.fileName : 'Chapter Preview'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {chapter
              ? `Chapter #${chapter.order} • ${chapter.status}`
              : 'Pick a chapter from the queue to inspect source and translation.'}
          </p>
        </div>

        {isTranslating && (
          <div className="flex items-center gap-3">
            <div className="w-36 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-primary-300 font-mono min-w-[42px]">
              {Math.round(progress)}%
            </span>
          </div>
        )}
      </div>

      {!chapter ? (
        <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60 select-none px-8 text-center">
          <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            ></path>
          </svg>
          <p className="font-serif italic text-lg">Waiting for chapter selection...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-px bg-gray-700 flex-1">
          <section className="bg-[#10151d] flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-400">
              Source Chapter
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <article className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-300">
                {chapter.sourceText || 'Source text will appear here once the chapter is loaded.'}
              </article>
            </div>
          </section>

          <section className="bg-[#161b22] flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-400">
              Russian Translation
            </div>
            <div
              ref={translatedPaneRef}
              className="flex-1 overflow-y-auto p-6"
              onMouseUp={handleMouseUp}
            >
              <article className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-200">
                {chapter.translatedText || (
                  <span className="text-gray-500">
                    Translation for this chapter has not been generated yet.
                  </span>
                )}
                {isTranslating && chapter.status === 'translating' && (
                  <span className="inline-block w-2 h-5 bg-primary-500 ml-1 align-middle animate-pulse"></span>
                )}
              </article>
            </div>
          </section>
        </div>
      )}

      {tooltip.visible && (
        <div
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl"
          style={{ left: tooltip.x, top: tooltip.y - 8, width: '320px' }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400 uppercase font-bold">Original Text Lookup</span>
            <button onClick={closeTooltip} className="text-gray-500 hover:text-white">
              ✕
            </button>
          </div>

          {tooltip.loading ? (
            <div className="flex items-center gap-2 text-sm text-primary-300 py-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span>Finding original term...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-800 p-2 rounded border border-gray-700">
                <span className="text-lg font-bold text-white break-words">{tooltip.original}</span>
              </div>
              {tooltip.sentence && (
                <div className="text-sm text-gray-400 italic border-l-2 border-gray-700 pl-2">
                  "{tooltip.sentence}"
                </div>
              )}
            </div>
          )}

          <div className="absolute left-1/2 -bottom-2 w-3 h-3 bg-gray-900 border-r border-b border-gray-600 transform -translate-x-1/2 rotate-45"></div>
        </div>
      )}
    </div>
  );
};

export default TranslationView;
