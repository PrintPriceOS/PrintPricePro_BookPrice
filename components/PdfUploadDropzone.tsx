import React, { useCallback, useState } from 'react';
import { ArrowUpTrayIcon, DocumentTextIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { t } from '../i18n/en';

interface PdfUploadDropzoneProps {
  onFileSelect: (file: File | null) => void;
  loading: boolean;
  fileName: string | null;
  error: string | null;
}

const PdfUploadDropzone: React.FC<PdfUploadDropzoneProps> = ({ onFileSelect, loading, fileName, error }) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Please drop a PDF file.');
      }
      e.dataTransfer.clearData();
    }
  }, [onFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Please select a PDF file.');
      }
    }
  }, [onFileSelect]);

  const handleRemoveFile = useCallback(() => {
    onFileSelect(null);
  }, [onFileSelect]);

  return (
    <div
      className={`relative p-4 sm:p-7 rounded-xl border-2 border-dashed transition-all duration-200 text-center group min-w-0
        ${isDragging ? 'border-corporate-accent bg-corporate-accent/5' : 'border-corporate-border-strong bg-corporate-elevated/60 hover:border-corporate-accent/50'}
        ${error ? 'border-corporate-accent/60 bg-corporate-accent/5' : ''}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="pdf-upload"
        accept="application/pdf"
        onChange={handleFileInputChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={loading}
      />
      {loading ? (
        <div className="flex flex-col items-center justify-center py-4">
          <div className="w-7 h-7 rounded-full border-2 border-corporate-accent border-b-transparent animate-spin" />
          <p className="mt-4 text-[10px] font-technical font-black tracking-wider sm:tracking-monolith text-corporate-accent uppercase">
            {t('processing_pdf')}
          </p>
        </div>
      ) : fileName ? (
        <div className="flex items-center justify-between gap-3 text-corporate-accent font-technical font-black uppercase tracking-wider text-xs bg-corporate-accent/5 p-3.5 rounded-xl border border-corporate-accent/30 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <DocumentTextIcon className="h-5 w-5 shrink-0" />
            <span className="truncate">{fileName}</span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
            className="text-corporate-text hover:text-corporate-accent transition-colors duration-200 relative z-10 shrink-0"
            aria-label="Remove PDF file"
          >
            <XCircleIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-2 sm:py-3">
          <ArrowUpTrayIcon className="h-6 w-6 sm:h-7 sm:w-7 text-corporate-text-secondary group-hover:text-corporate-accent transition-colors duration-200" />
          <p className="mt-2.5 text-[11px] font-sans font-black tracking-wider sm:tracking-monolith text-corporate-text uppercase break-words">
            {t('upload_pdf_instructions')}
          </p>
          <p className="mt-1 text-[9px] font-technical text-corporate-muted uppercase tracking-wider">
            PDF Page Count &amp; Trim Size Auto-Detection
          </p>
        </div>
      )}
      {error && (
        <p className="mt-3 text-[10px] text-corporate-accent font-technical uppercase tracking-wider break-words">
          [!] {error}
        </p>
      )}
    </div>
  );
};

export default PdfUploadDropzone;
