import React from 'react';
import { InputType } from '../types';
import { FileText, Globe, Image as ImageIcon, Music, Video, Box, Database } from 'lucide-react';

interface InputSelectorProps {
  onSelect: (type: InputType) => void;
  selected: InputType | null;
}

const InputSelector: React.FC<InputSelectorProps> = ({ onSelect, selected }) => {
  const options = [
    { type: InputType.PDF, icon: FileText, label: 'PDF Document', color: 'bg-red-50 text-red-600 border-red-200' },
    { type: InputType.WEBSITE, icon: Globe, label: 'Website URL', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { type: InputType.IMAGE, icon: ImageIcon, label: 'Image Scan', color: 'bg-green-50 text-green-600 border-green-200' },
    { type: InputType.AUDIO, icon: Music, label: 'Audio File', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    { type: InputType.VIDEO, icon: Video, label: 'Video File', color: 'bg-orange-50 text-orange-600 border-orange-200' },
    { type: InputType.XAPI, icon: Database, label: 'xAPI / LRS', color: 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed', disabled: true },
    { type: InputType.SCORM, icon: Box, label: 'SCORM Pkg', color: 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed', disabled: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mx-auto">
      {options.map((opt) => (
        <button
          key={opt.type}
          onClick={() => !opt.disabled && onSelect(opt.type)}
          disabled={opt.disabled}
          className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200
            ${opt.disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md cursor-pointer transform hover:-translate-y-1'}
            ${selected === opt.type ? 'ring-2 ring-offset-2 ring-indigo-500 border-transparent shadow-md' : 'border-slate-200'}
            ${opt.color}
          `}
        >
          <opt.icon size={32} className="mb-3" />
          <span className="font-semibold text-sm">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

export default InputSelector;