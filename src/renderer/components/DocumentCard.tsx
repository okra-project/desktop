import React from 'react';
import { Calendar, HardDrive, ChevronRight } from 'lucide-react';
import { Document } from '../types';
import { formatLibraryDate, formatLibraryFileSize } from '../utils/format-utils';

interface DocumentCardProps {
  document: Document;
  onClick: (doc: Document) => void;
  isLoading?: boolean;
}

export default function DocumentCard({ document, onClick, isLoading }: DocumentCardProps) {
  return (
    <button
      type="button"
      onClick={() => !isLoading && onClick(document)}
      className={`text-left w-full bg-white border border-sidebar-border rounded-xl p-4 hover:border-okra-yellow hover:shadow-md transition-all group cursor-pointer flex flex-col h-full ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
      disabled={isLoading}
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] w-full bg-sidebar-bg rounded-lg mb-4 overflow-hidden border border-sidebar-border/50 relative">
        {document.thumbnail_url ? (
          <img
            src={document.thumbnail_url}
            alt={document.file_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-sidebar-text/20">
            📄
          </div>
        )}
        
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/5 transition-colors duration-300" />
      </div>

      <div className="flex items-start justify-between gap-4 mb-2 w-full">
        <div className="font-semibold text-ink text-sm truncate group-hover:text-okra-yellow transition-colors" title={document.file_name}>
          {document.file_name}
        </div>
        <ChevronRight className="w-4 h-4 text-ink/40 group-hover:text-okra-yellow transition-colors shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink/60 mt-auto">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {formatLibraryDate(document.upload_date)}
        </span>
        {document.file_size > 0 && (
          <span className="flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5" />
            {formatLibraryFileSize(document.file_size)}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="mt-3 text-xs text-okra-orange flex items-center gap-2 font-medium">
            <span className="animate-spin h-3 w-3 border-2 border-okra-orange border-t-transparent rounded-full"></span>
            Opening Document...
        </div>
      )}
    </button>
  );
}
