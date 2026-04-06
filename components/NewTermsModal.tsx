import React, { useEffect, useState } from 'react';
import { GlossaryItem, NewTermDiscovery } from '../types';
import { createGlossaryItem } from '../services/projectUtils';

interface NewTermsModalProps {
  terms: NewTermDiscovery[];
  isOpen: boolean;
  onClose: () => void;
  onApprove: (terms: GlossaryItem[], termKeys: string[]) => void;
  onReject: (termKeys: string[]) => void;
}

const NewTermsModal: React.FC<NewTermsModalProps> = ({
  terms,
  isOpen,
  onClose,
  onApprove,
  onReject,
}) => {
  const [localTerms, setLocalTerms] = useState<NewTermDiscovery[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ term: '', translation: '' });

  useEffect(() => {
    if (!isOpen) return;

    const next = JSON.parse(JSON.stringify(terms)) as NewTermDiscovery[];
    setLocalTerms(next);
    setSelected(new Set(next.map((term) => term.id)));
    setEditingKey(null);
  }, [isOpen, terms]);

  useEffect(() => {
    if (isOpen && terms.length === 0) {
      onClose();
    }
  }, [isOpen, onClose, terms.length]);

  if (!isOpen) return null;

  const getKey = (term: NewTermDiscovery) => term.id;

  const toggleSelect = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startEditing = (term: NewTermDiscovery) => {
    const key = getKey(term);
    setEditingKey(key);
    setEditValues({
      term: term.term,
      translation: term.suggestedTranslation,
    });
  };

  const saveEdit = (key: string) => {
    setLocalTerms((current) =>
      current.map((term) =>
        getKey(term) === key
          ? {
              ...term,
              term: editValues.term,
              suggestedTranslation: editValues.translation,
            }
          : term
      )
    );
    setEditingKey(null);
  };

  const approveSelected = () => {
    const selectedTerms = localTerms.filter((term) => selected.has(getKey(term)));
    const glossaryItems = selectedTerms.map((term) =>
      createGlossaryItem(
        term.term,
        term.suggestedTranslation,
        'manual',
        term.category,
        term.chapterId
      )
    );
    onApprove(glossaryItems, selectedTerms.map(getKey));
  };

  const rejectSelected = () => {
    const selectedKeys = localTerms.filter((term) => selected.has(getKey(term))).map(getKey);
    onReject(selectedKeys);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-xl max-w-4xl w-full border border-gray-600 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Review Queue</h3>
            <p className="text-gray-400 text-sm mt-1">
              Low-confidence or conflicting terms wait here while translation keeps running.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {localTerms.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">Review queue is empty.</div>
          ) : (
            localTerms.map((term) => {
              const key = getKey(term);
              const isEditing = editingKey === key;
              const isSelected = selected.has(key);

              return (
                <div
                  key={key}
                  className={`p-4 rounded-lg border transition ${
                    isSelected ? 'bg-gray-750/50 border-primary-500/50' : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(key)}
                      className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-primary-600 focus:ring-primary-500"
                    />

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                          <input
                            type="text"
                            value={editValues.term}
                            onChange={(event) =>
                              setEditValues((current) => ({ ...current, term: event.target.value }))
                            }
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                          />
                          <input
                            type="text"
                            value={editValues.translation}
                            onChange={(event) =>
                              setEditValues((current) => ({
                                ...current,
                                translation: event.target.value,
                              }))
                            }
                            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white text-lg">{term.term}</span>
                            <span className="text-gray-500">→</span>
                            <span className="text-primary-300 font-medium text-lg">
                              {term.suggestedTranslation}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
                            <span className="px-2 py-1 border border-gray-600 rounded-full">
                              {term.category}
                            </span>
                            <span className="px-2 py-1 border border-gray-600 rounded-full">
                              confidence {Math.round(term.confidence * 100)}%
                            </span>
                            <span className="px-2 py-1 border border-gray-600 rounded-full">
                              chapter #{term.chapterId}
                            </span>
                            {term.conflictWith && (
                              <span className="px-2 py-1 border border-red-700 text-red-300 rounded-full">
                                conflicts with: {term.conflictWith}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 text-xs text-gray-400 italic border-l-2 border-gray-600 pl-3 py-1 leading-relaxed">
                        "{term.context}"
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(key)}
                            className="p-2 bg-green-900/50 hover:bg-green-700 text-green-300 rounded transition border border-green-800"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition border border-gray-600"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(term)}
                          className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-850 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white transition">
            Close
          </button>
          <button
            onClick={rejectSelected}
            disabled={selected.size === 0}
            className="px-4 py-2 text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reject Selected
          </button>
          <button
            onClick={approveSelected}
            disabled={selected.size === 0}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-lg shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Approve Selected
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewTermsModal;
