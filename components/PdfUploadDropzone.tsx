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
        alert('Please drop a PDF file.'); // Simple alert for non-PDF files
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
        alert('Please select a PDF file.'); // Simple alert for non-PDF files
      }
    }
  }, [onFileSelect]);

  const handleRemoveFile = useCallback(() => {
    onFileSelect(null);
  }, [onFileSelect]);

  return (
    <div
      className={`relative p-6 sm:p-12 border-2 border-dashed transition-all duration-300 text-center group
        ${isDragging ? 'border-corporate-accent bg-corporate-accent/5' : 'border-white/10 bg-corporate-primary'}
        ${error ? 'border-corporate-accent/50 bg-corporate-accent/5' : ''}
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
        <div className="flex flex-col items-center justify-center py-6">
          <div className="w-8 h-8 border-2 border-corporate-accent border-b-transparent animate-spin" />
          <p className="mt-6 text-[0.6rem] font-technical font-black tracking-monolith text-corporate-accent uppercase">{t('processing_pdf')}</p>
        </div>
      ) : fileName ? (
        <div className="flex items-center justify-between space-x-4 text-corporate-accent font-technical font-black uppercase tracking-monolith text-[0.7rem] bg-corporate-accent/5 p-4 border border-corporate-accent/20">
          <div className="flex items-center space-x-3 truncate">
            <DocumentTextIcon className="h-5 w-5" />
            <span className="truncate">{fileName}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
            className="text-white hover:text-corporate-accent transition-colors duration-200"
            aria-label="Remove PDF file"
          >
            <XCircleIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6">
          <ArrowUpTrayIcon className="h-10 w-10 text-corporate-accent/40 group-hover:text-corporate-accent transition-colors duration-300" />
          <p className="mt-6 text-[0.6rem] font-sans font-black tracking-monolith text-corporate-text-secondary uppercase group-hover:text-white transition-colors duration-300">{t('upload_pdf_instructions')}</p>
          <p className="mt-2 text-[0.5rem] font-technical text-corporate-muted uppercase tracking-widest leading-none">Accepted node: application/pdf</p>
        </div>
      )}
    </div>
  );
};

export default PdfUploadDropzone;