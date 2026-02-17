import React, { useState, useRef } from 'react';
import { Upload, Link, ArrowRight, File as FileIcon, AlertCircle } from 'lucide-react';
import { InputType, ExtractedData, ProcessingStatus } from './types';
import InputSelector from './components/InputSelector';
import ProcessingView from './components/ProcessingView';
import ResultView from './components/ResultView';
import { geminiService } from './services/geminiService';
import { fileToBase64, getMimeType } from './services/fileHelpers';
import { MAX_FILE_SIZE_MB } from './constants';

const App: React.FC = () => {
  const [selectedType, setSelectedType] = useState<InputType | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [urlInput, setUrlInput] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputSelect = (type: InputType) => {
    setSelectedType(type);
    setError(null);
    setResult(null);
    setUrlInput('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
      return;
    }

    setStatus('uploading');
    try {
      const base64 = await fileToBase64(file);
      const mimeType = getMimeType(file);
      
      setStatus('analyzing');
      const data = await geminiService.analyzeContent(base64, 'base64', mimeType);
      
      setResult(data);
      setStatus('complete');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process file');
      setStatus('error');
    } finally {
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    setStatus('analyzing');
    try {
      const data = await geminiService.analyzeContent(urlInput, 'url');
      setResult(data);
      setStatus('complete');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process URL');
      setStatus('error');
    }
  };

  const resetApp = () => {
    setStatus('idle');
    setResult(null);
    setSelectedType(null);
    setError(null);
    setUrlInput('');
  };

  const getAcceptedFileTypes = () => {
    switch (selectedType) {
      case InputType.PDF: return '.pdf';
      case InputType.IMAGE: return 'image/*';
      case InputType.AUDIO: return 'audio/*';
      case InputType.VIDEO: return 'video/*';
      default: return '*/*';
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">D</div>
            <h1 className="text-xl font-bold text-slate-800">DocuExtract AI</h1>
          </div>
          <div className="text-sm text-slate-500 hidden sm:block">
            Intelligent Document Processing
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 sm:p-8">
        
        {status === 'error' && (
           <div className="w-full max-w-md bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6 text-red-700">
             <AlertCircle className="shrink-0 mt-0.5" size={20} />
             <div>
               <h4 className="font-semibold text-sm">Error Processing Request</h4>
               <p className="text-sm mt-1">{error}</p>
               <button onClick={() => setStatus('idle')} className="text-sm font-medium underline mt-2 hover:text-red-800">Try Again</button>
             </div>
           </div>
        )}

        {status === 'idle' && !result && (
          <div className="w-full max-w-5xl flex flex-col items-center space-y-12 animate-fadeIn">
            <div className="text-center space-y-4 max-w-2xl">
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                Transform Any Content into <br />
                <span className="text-indigo-600">Structured Data</span>
              </h2>
              <p className="text-lg text-slate-600">
                Upload PDFs, images, media, or URLs. Our AI smart layer automatically extracts, formats, and exports clean reports.
              </p>
            </div>

            <InputSelector selected={selectedType} onSelect={handleInputSelect} />

            {selectedType && (
              <div className="w-full max-w-xl animate-slideUp fade-in-up">
                {selectedType === InputType.WEBSITE ? (
                  <form onSubmit={handleUrlSubmit} className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Enter Website URL</label>
                    <div className="flex gap-2">
                      <div className="relative flex-grow">
                        <Link className="absolute left-3 top-3 text-slate-400" size={20} />
                        <input
                          type="url"
                          required
                          placeholder="https://www.amazon.com/product/..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                        />
                      </div>
                      <button 
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2"
                      >
                        Extract <ArrowRight size={18} />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Note: AI will analyze the public content of the URL using Google Search Grounding.
                    </p>
                  </form>
                ) : (
                  <div 
                    className="bg-white p-8 rounded-2xl shadow-lg border-2 border-dashed border-indigo-100 hover:border-indigo-300 transition-all cursor-pointer group text-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept={getAcceptedFileTypes()}
                      onChange={handleFileUpload}
                    />
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="text-indigo-600" size={32} />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">
                      Upload {selectedType === InputType.PDF ? 'Document' : selectedType === InputType.IMAGE ? 'Image' : 'Media File'}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Drag & drop or click to browse
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                       <FileIcon size={12} /> Supports {getAcceptedFileTypes()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(status === 'uploading' || status === 'analyzing') && (
          <ProcessingView status={status} />
        )}

        {status === 'complete' && result && (
          <ResultView data={result} onReset={resetApp} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} DocuExtract AI. Powered by Google Gemini.</p>
        </div>
      </footer>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.5s ease-out forwards;
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default App;