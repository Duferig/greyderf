import React, { useState, useEffect } from 'react';

interface CustomCSSModalProps {
  isOpen: boolean;
  onClose: () => void;
  css: string;
  onSave: (css: string) => void;
}

const CustomCSSModal: React.FC<CustomCSSModalProps> = ({ isOpen, onClose, css, onSave }) => {
  const [localCss, setLocalCss] = useState(css);

  useEffect(() => {
    if (isOpen) {
      setLocalCss(css);
    }
  }, [css, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full border border-gray-600 shadow-2xl flex flex-col h-[80vh]">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🎨</span> Custom CSS Styling
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <div className="p-4 flex-1 flex flex-col bg-gray-850">
            <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mb-4 text-sm text-blue-200">
               <strong>Tip:</strong> The main content container has the ID <code>#translation-text</code>.
               <br/>
               You can target paragraphs with <code>#translation-text p</code>.
            </div>
            <textarea
                className="flex-1 w-full bg-[#0d1117] border border-gray-700 rounded-lg p-4 text-sm font-mono text-green-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 resize-none leading-relaxed"
                value={localCss}
                onChange={(e) => setLocalCss(e.target.value)}
                placeholder={`/* Example Style */
#translation-text {
  font-family: 'Times New Roman', serif;
}

#translation-text p {
  font-size: 1.25rem;
  line-height: 2;
  color: #e2e8f0;
  margin-bottom: 2rem;
}`}
                spellCheck={false}
            />
        </div>
        
        <div className="p-4 border-t border-gray-700 flex justify-end gap-3 bg-gray-900 rounded-b-xl">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-gray-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onSave(localCss); onClose(); }} 
            className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-lg shadow-lg transition"
          >
            Save Styles
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomCSSModal;