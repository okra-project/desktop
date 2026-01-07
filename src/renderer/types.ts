export interface Document {
  uuid: string;
  file_name: string;
  file_size: number;
  upload_date: string;
  document_type: string;
  thumbnail_url?: string;
  verification_progress?: {
    totalPages?: number;
    extractionStatus?: string;
  };
}
