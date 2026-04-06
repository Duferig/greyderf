import React from 'react';
import { ChapterJob } from '../types';

interface ChapterQueuePanelProps {
  chapters: ChapterJob[];
  selectedChapterId: number | null;
  onSelectChapter: (chapterId: number) => void;
}

const STATUS_STYLES: Record<ChapterJob['status'], string> = {
  pending: 'bg-gray-800 text-gray-300 border-gray-700',
  translating: 'bg-blue-900/40 text-blue-200 border-blue-600',
  completed: 'bg-green-900/40 text-green-200 border-green-700',
  error: 'bg-red-900/40 text-red-200 border-red-700',
};

const ChapterQueuePanel: React.FC<ChapterQueuePanelProps> = ({
  chapters,
  selectedChapterId,
  onSelectChapter,
}) => {
  const completedCount = chapters.filter((chapter) => chapter.status === 'completed').length;
  const errorCount = chapters.filter((chapter) => chapter.status === 'error').length;

  return (
    <div className="bg-gray-850 border border-gray-700 rounded-xl shadow-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-100">Chapter Queue</h3>
          <span className="text-xs text-gray-400">
            {completedCount}/{chapters.length} done
          </span>
        </div>
        <div className="mt-2 flex gap-2 text-[11px] text-gray-400">
          <span>{errorCount} errors</span>
          <span>•</span>
          <span>{chapters.length - completedCount - errorCount} remaining</span>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2 space-y-2">
        {chapters.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500 text-center">
            Pick a source folder to build the chapter queue.
          </div>
        ) : (
          chapters.map((chapter) => {
            const isSelected = chapter.id === selectedChapterId;

            return (
              <button
                key={chapter.id}
                onClick={() => onSelectChapter(chapter.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  isSelected
                    ? 'border-primary-500 bg-primary-900/20 shadow-lg shadow-primary-900/10'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-900/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 mb-1">#{chapter.order}</div>
                    <div className="font-medium text-sm text-gray-100 truncate">{chapter.fileName}</div>
                    {chapter.error && (
                      <div className="mt-2 text-xs text-red-300 line-clamp-2">{chapter.error}</div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 text-[10px] font-bold uppercase rounded-full border ${STATUS_STYLES[chapter.status]}`}
                  >
                    {chapter.status}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChapterQueuePanel;
