import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

interface ProcessingViewProps {
  status: string;
}

const ProcessingView: React.FC<ProcessingViewProps> = ({ status }) => {
  const [message, setMessage] = useState("Initializing AI...");

  useEffect(() => {
    const messages = [
      "Identifying document structure...",
      "Extracting text layers...",
      "Analyzing tabular data...",
      "Recognizing entities...",
      "Formatting output...",
      "Generating smart summary...",
    ];
    let i = 0;
    const interval = setInterval(() => {
      setMessage(messages[i % messages.length]);
      i++;
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
        <div className="relative bg-white p-4 rounded-full shadow-lg border border-indigo-100">
           {status === 'analyzing' ? (
               <Sparkles className="w-12 h-12 text-indigo-600 animate-spin-slow" />
           ) : (
               <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
           )}
        </div>
      </div>
      <h3 className="text-xl font-bold text-slate-800 mb-2">{status === 'analyzing' ? 'AI Processing' : 'Uploading'}</h3>
      <p className="text-slate-500 max-w-md">{message}</p>
    </div>
  );
};

export default ProcessingView;