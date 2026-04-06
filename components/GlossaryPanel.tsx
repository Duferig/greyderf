import React, { useMemo, useState } from 'react';
import { GlossaryItem } from '../types';
import { createGlossaryItem } from '../services/projectUtils';

interface GlossaryPanelProps {
  glossary: GlossaryItem[];
  setGlossary: (glossary: GlossaryItem[]) => void;
  isExtracting: boolean;
  onImportGlossary: () => void;
}

const GlossaryPanel: React.FC<GlossaryPanelProps> = ({
  glossary,
  setGlossary,
  isExtracting,
  onImportGlossary,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const sortedGlossary = useMemo(
    () =>
      [...glossary].sort((left, right) =>
        left.term.localeCompare(right.term, undefined, { sensitivity: 'base' })
      ),
    [glossary]
  );

  const updateItem = (index: number, field: 'term' | 'translation', value: string) => {
    const nextGlossary = [...sortedGlossary];
    const target = nextGlossary[index];
    nextGlossary[index] = {
      ...target,
      [field]: value,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };
    setGlossary(nextGlossary);
  };

  const removeItem = (index: number) => {
    setGlossary(sortedGlossary.filter((_, currentIndex) => currentIndex !== index));
  };

  const addManualTerm = () => {
    setGlossary([...sortedGlossary, createGlossaryItem('', '', 'manual')]);
  };

  const downloadGlossary = () => {
    const jsonString = JSON.stringify(sortedGlossary, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'approved-glossary.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gray-850 border border-gray-700 rounded-xl overflow-hidden shadow-lg flex flex-col h-full">
      <div
        className="bg-gray-750 px-4 py-3 flex justify-between items-center cursor-pointer select-none"
        onClick={() => setIsOpen((value) => !value)}
      >
        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
          Approved Glossary
          <span className="bg-primary-600 text-xs px-2 py-0.5 rounded-full text-white">
            {sortedGlossary.length}
          </span>
        </h3>
        <span className="text-gray-400">{isOpen ? '▼' : '▶'}</span>
      </div>

      {isOpen && (
        <div className="flex-1 overflow-y-auto p-2">
          {isExtracting ? (
            <div className="flex items-center justify-center h-32 space-x-2 animate-pulse text-primary-500">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
              <span>Extracting glossary terms...</span>
            </div>
          ) : (
            <>
              <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs text-gray-400 uppercase bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Original</th>
                    <th className="px-3 py-2">Russian</th>
                    <th className="px-3 py-2">Meta</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGlossary.map((item, index) => (
                    <tr
                      key={`${item.term}-${index}`}
                      className="border-b border-gray-700 hover:bg-gray-800 transition-colors"
                    >
                      <td className="p-1 align-top">
                        <input
                          type="text"
                          value={item.term}
                          onChange={(event) => updateItem(index, 'term', event.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 p-1 text-primary-200"
                          placeholder="Original term"
                        />
                      </td>
                      <td className="p-1 align-top">
                        <input
                          type="text"
                          value={item.translation}
                          onChange={(event) => updateItem(index, 'translation', event.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 p-1 text-gray-100"
                          placeholder="Russian translation"
                        />
                      </td>
                      <td className="p-2 align-top">
                        <div className="text-[11px] text-gray-400 leading-5">
                          <div>{item.category}</div>
                          <div>{item.source}</div>
                        </div>
                      </td>
                      <td className="p-1 text-center align-top">
                        <button
                          onClick={() => removeItem(index)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="Remove term"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={addManualTerm}
                  className="py-2 text-xs font-medium text-gray-300 border border-dashed border-gray-600 rounded hover:bg-gray-800 hover:text-white transition"
                >
                  + Add Manually
                </button>
                <button
                  onClick={onImportGlossary}
                  className="py-2 text-xs font-medium text-gray-300 border border-gray-600 rounded hover:bg-gray-800 hover:text-white transition"
                >
                  Import Glossary
                </button>
                <button
                  onClick={downloadGlossary}
                  disabled={sortedGlossary.length === 0}
                  className="py-2 text-xs font-medium text-primary-300 border border-gray-600 rounded hover:bg-gray-800 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save JSON
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GlossaryPanel;
