export enum InputType {
  PDF = 'PDF',
  WEBSITE = 'WEBSITE',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  XAPI = 'XAPI (Coming Soon)',
  SCORM = 'SCORM (Coming Soon)',
}

export interface ExtractedData {
  rawText: string;
  markdown: string;
  summary: string;
  detectedType: string;
  metadata?: Record<string, any>;
}

export type ProcessingStatus = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export interface GenerationConfig {
  includeTables: boolean;
  includeSummary: boolean;
}