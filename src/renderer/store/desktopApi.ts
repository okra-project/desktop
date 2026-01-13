import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const getBaseUrl = () => process.env.OKRAPDF_API_URL || '';

// ============================================================================
// Types
// ============================================================================

export type VerificationPageStatus =
  | 'complete' // All entities verified
  | 'partial' // Some entities verified
  | 'flagged' // Has flagged items
  | 'pending' // Has entities but none verified
  | 'empty' // No entities
  | 'gap' // OCR content but no entities
  | 'error'; // Verification error

export interface VerificationTreePage {
  page: number;
  status: VerificationPageStatus;
  total: number;
  verified: number;
  pending: number;
  flagged: number;
  rejected: number;
  avgConfidence: number;
  hasOcr: boolean;
  ocrLineCount: number;
  hasCoverageGaps: boolean;
  uncoveredCount: number;
  resolution: string | null;
  classification: string | null;
  isStale: boolean;
}

export interface VerificationTreeSummary {
  complete: number;
  partial: number;
  flagged: number;
  pending: number;
  empty: number;
  gap: number;
  resolved?: number;
  stale?: number;
}

export interface VerificationTreeResponse {
  jobId: string;
  documentId: string;
  totalPages: number;
  summary: VerificationTreeSummary;
  pages: VerificationTreePage[];
}

export interface TextBlock {
  text: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageDimension {
  width: number | null;
  height: number | null;
}

export interface PageContent {
  page: number;
  content: string;
  version?: number;
  blocks?: TextBlock[];
  dimension?: PageDimension | null;
}

export interface EntityBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EntityType = string;

export interface Entity {
  id: string;
  type: EntityType;
  title: string | null;
  page: number;
  schema?: string[];
  isComplete?: boolean;
  bbox?: EntityBBox;
}

export interface EntitiesResponse {
  jobId: string;
  entities: Entity[];
  counts: Record<string, number>;
  extractionStatus?:
    | 'not_started'
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'paused';
  totalPages?: number;
}

export interface ExtractedTable {
  id: string;
  page_number: number;
  markdown: string;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence: number | null;
  verification_status: 'pending' | 'verified' | 'flagged' | 'rejected';
  verified_by: string | null;
  verified_at: string | null;
  was_corrected?: boolean;
  created_at: string;
}

export interface TablesResponse {
  tables: ExtractedTable[];
  source: 'job_id' | 'document_uuid';
}

export interface VerificationHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  state: string;
  previousState: string | null;
  transitionName: string | null;
  triggeredBy: string | null;
  triggeredByName: string | null;
  triggeredByImage: string | null;
  reason: string | null;
  resolution: string | null;
  classification: string | null;
  pageNum: number | null;
  createdAt: string;
}

export interface VerificationHistoryResponse {
  history: VerificationHistoryEntry[];
}

export interface PageInfo {
  page: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
  ocr_status?: 'idle' | 'processing' | 'completed' | 'error';
  ai_status?: 'idle' | 'processing' | 'completed' | 'error';
  url?: string;
  version?: number;
  error?: string | null;
}

export interface PagesListResponse {
  job_id: string;
  pages: PageInfo[];
}

export interface SavePageVersionRequest {
  jobId: string;
  pageNum: number;
  content: string;
}

export interface SavePageVersionResponse {
  success: boolean;
  page: number;
  version: number;
}

export interface UpdateTableStatusRequest {
  tableId: string;
  jobId?: string;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
}

export interface UpdateTableStatusResponse {
  success: boolean;
  table: {
    id: string;
    verification_status: 'pending' | 'verified' | 'flagged' | 'rejected';
    verified_by: string | null;
    verified_at: string | null;
  };
}

export interface FixAndAcceptTableRequest {
  tableId: string;
  jobId?: string;
  correctedMarkdown: string;
}

export interface FixAndAcceptTableResponse {
  success: boolean;
  table: {
    id: string;
    markdown: string;
    verification_status: 'verified';
    verified_by: string | null;
    verified_at: string | null;
    was_corrected: boolean;
  };
}

export interface TableHistoryEntry {
  id: string;
  created_at: string;
  state: string;
  previous_state: string | null;
  transition_name: string | null;
  reason: string;
  was_corrected: boolean;
}

export interface TableHistoryResponse {
  entries: TableHistoryEntry[];
}

export interface ResolvePageStatusRequest {
  jobId: string;
  pageNum: number;
  resolution: string;
  classification?: string;
  reason?: string;
}

// ============================================================================
// Custom base query that gets token from electron store
// ============================================================================

const desktopBaseQuery = fetchBaseQuery({
  baseUrl: getBaseUrl(),
  prepareHeaders: async (headers) => {
    // Get token via IPC (main process handles refresh if expired)
    if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
      try {
        const result =
          await window.electron.ipcRenderer.invoke('auth:get-token');
        if (result?.token) {
          headers.set('Authorization', `Bearer ${result.token}`);
        }
      } catch (err) {
        console.error('[desktopApi] Failed to get auth token:', err);
      }
    }
    return headers;
  },
});

// ============================================================================
// RTK Query API
// ============================================================================

export const desktopApi = createApi({
  reducerPath: 'desktopApi',
  baseQuery: desktopBaseQuery,
  tagTypes: [
    'VerificationTree',
    'PageContent',
    'Entities',
    'Tables',
    'History',
  ],
  endpoints: (build) => ({
    /**
     * Get verification tree for a job
     */
    getVerificationTree: build.query<VerificationTreeResponse, string>({
      query: (jobId) => `/api/desktop/ocr/jobs/${jobId}/verification-tree`,
      providesTags: (result, error, jobId) => [
        { type: 'VerificationTree', id: jobId },
      ],
      keepUnusedDataFor: 60,
    }),

    /**
     * Get page content
     */
    getPageContent: build.query<
      PageContent,
      { jobId: string; pageNum: number }
    >({
      query: ({ jobId, pageNum }) =>
        `/api/desktop/ocr/jobs/${jobId}/pages/${pageNum}`,
      providesTags: (result, error, { jobId, pageNum }) => [
        { type: 'PageContent', id: `${jobId}-${pageNum}` },
      ],
    }),

    /**
     * List all pages for a job
     */
    listPages: build.query<PagesListResponse, string>({
      query: (jobId) => `/api/desktop/ocr/jobs/${jobId}/pages`,
    }),

    /**
     * Get entities for a job
     */
    getEntities: build.query<
      EntitiesResponse,
      {
        jobId: string;
        type?: string;
      }
    >({
      query: ({ jobId, type = 'all' }) =>
        `/api/desktop/ocr/jobs/${jobId}/entities?type=${type}`,
      providesTags: ['Entities'],
      keepUnusedDataFor: 30,
    }),

    /**
     * Get tables for a job
     */
    getTablesByJobId: build.query<
      TablesResponse,
      { jobId: string; page?: number }
    >({
      query: ({ jobId, page }) =>
        page
          ? `/api/desktop/ocr/jobs/${jobId}/tables?page=${page}`
          : `/api/desktop/ocr/jobs/${jobId}/tables`,
      providesTags: ['Tables'],
      keepUnusedDataFor: 60,
    }),

    /**
     * Get verification history
     */
    getVerificationHistory: build.query<
      VerificationHistoryResponse,
      { jobId: string; limit?: number }
    >({
      query: ({ jobId, limit = 50 }) =>
        `/api/desktop/ocr/jobs/${jobId}/history?limit=${limit}`,
      providesTags: (result, error, { jobId }) => [
        { type: 'History', id: jobId },
      ],
    }),

    /**
     * Get table history
     */
    getTableHistory: build.query<TableHistoryResponse, string>({
      query: (tableId) => `/api/desktop/refinery/tables/${tableId}/history`,
      providesTags: ['History'],
    }),

    /**
     * Save page content as new version
     */
    savePageVersion: build.mutation<
      SavePageVersionResponse,
      SavePageVersionRequest
    >({
      query: ({ jobId, pageNum, content }) => ({
        url: `/api/desktop/ocr/jobs/${jobId}/pages/${pageNum}`,
        method: 'PATCH',
        body: { content },
      }),
      async onQueryStarted(
        { jobId, pageNum, content },
        { dispatch, queryFulfilled },
      ) {
        // Optimistic update
        const patchPageContent = dispatch(
          desktopApi.util.updateQueryData(
            'getPageContent',
            { jobId, pageNum },
            (draft) => {
              draft.content = content;
              draft.version = (draft.version || 1) + 1;
            },
          ),
        );

        try {
          const { data } = await queryFulfilled;
          if (data.version) {
            dispatch(
              desktopApi.util.updateQueryData(
                'getPageContent',
                { jobId, pageNum },
                (draft) => {
                  draft.version = data.version;
                },
              ),
            );
          }
        } catch {
          patchPageContent.undo();
        }
      },
    }),

    /**
     * Update table verification status
     */
    updateTableStatus: build.mutation<
      UpdateTableStatusResponse,
      UpdateTableStatusRequest
    >({
      query: ({ tableId, status }) => ({
        url: `/api/desktop/refinery/tables/${tableId}`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Tables', 'VerificationTree'],
    }),

    /**
     * Fix and accept table
     */
    fixAndAcceptTable: build.mutation<
      FixAndAcceptTableResponse,
      FixAndAcceptTableRequest
    >({
      query: ({ tableId, correctedMarkdown }) => ({
        url: `/api/desktop/refinery/tables/${tableId}/fix`,
        method: 'POST',
        body: { correctedMarkdown },
      }),
      invalidatesTags: ['Tables', 'VerificationTree', 'History'],
    }),

    /**
     * Resolve page status
     */
    resolvePageStatus: build.mutation<
      { success: boolean },
      ResolvePageStatusRequest
    >({
      query: ({ jobId, pageNum, ...body }) => ({
        url: `/api/desktop/ocr/jobs/${jobId}/pages/${pageNum}/resolve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { jobId }) => [
        { type: 'VerificationTree', id: jobId },
      ],
    }),
  }),
});

export const {
  useGetVerificationTreeQuery,
  useGetPageContentQuery,
  useListPagesQuery,
  useGetEntitiesQuery,
  useGetTablesByJobIdQuery,
  useGetVerificationHistoryQuery,
  useGetTableHistoryQuery,
  useSavePageVersionMutation,
  useUpdateTableStatusMutation,
  useFixAndAcceptTableMutation,
  useResolvePageStatusMutation,
} = desktopApi;
