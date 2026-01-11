import React, { useState, useCallback, DragEvent } from 'react';

interface DragDropOverlayProps {
  children: React.ReactNode;
  onFileDrop: (filePath: string) => void;
}

export default function DragDropOverlay({ children, onFileDrop }: DragDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragging to false if we're leaving the main container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(f => f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFile && pdfFile.path) {
      onFileDrop(pdfFile.path);
    }
  }, [onFileDrop]);

  return (
    <div 
      className="relative h-full w-full"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      
      {isDragging && (
        <div 
          className="absolute inset-0 bg-okra-yellow/10 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-okra-yellow border-dashed rounded-xl m-4 pointer-events-none"
        >
          <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center animate-bounce-gentle">
            <div className="w-20 h-20 bg-okra-yellow/20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-ink">Drop PDF to Import</h3>
            <p className="text-sidebar-text mt-2">Process with Claude AI instantly</p>
          </div>
        </div>
      )}
    </div>
  );
}
