import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileDown, FileText, CheckCircle } from 'lucide-react';
import { ExtractedData } from '../types';
import { exportToPDF, exportToWord } from '../services/exportService';

interface ResultViewProps {
  data: ExtractedData;
  onReset: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({ data, onReset }) => {
  
  const handlePdfExport = () => {
    exportToPDF(data.markdown);
  };

  const handleWordExport = () => {
    exportToWord(data.markdown);
  };

  return (
    <div className="w-full max-w-7xl mx-auto animate-fadeIn pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <CheckCircle className="text-green-500" /> Extraction Complete
           </h2>
           <p className="text-slate-500 text-sm mt-1">Detected Type: <span className="font-semibold text-indigo-600">{data.detectedType}</span></p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={handlePdfExport}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-medium transition-colors border border-red-200"
            >
                <FileDown size={18} /> Export PDF
            </button>
            <button 
                onClick={handleWordExport}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors border border-blue-200"
            >
                <FileText size={18} /> Export Word
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Preview Area - A4 Paper Style */}
        <div className="lg:col-span-3">
             <div className="bg-white rounded-sm shadow-xl border border-slate-200 min-h-[800px] w-full p-8 md:p-12">
                 <div className="prose prose-indigo max-w-none">
                     <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {data.markdown}
                     </ReactMarkdown>
                 </div>
             </div>
        </div>

        {/* Sidebar / Metadata */}
        <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sticky top-24">
                <h3 className="font-semibold text-slate-800 mb-3">AI Summary</h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    {data.summary}
                </p>

                <div className="bg-indigo-50 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-indigo-900 mb-2 text-sm">Extraction Details</h3>
                    <ul className="text-xs text-indigo-800 space-y-2">
                        <li className="flex gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></span>
                            <span>Structure preserved</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></span>
                            <span>Tables formatted</span>
                        </li>
                    </ul>
                </div>

                <button 
                    onClick={onReset}
                    className="w-full py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-lg font-medium transition-colors text-sm"
                >
                    Process Another Document
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ResultView;