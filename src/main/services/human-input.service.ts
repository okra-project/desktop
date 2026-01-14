import { ipcMain } from 'electron';
import { progressQueue } from '../utils/progress-queue';

export interface AskUserParams {
  question: string;
  options?: string[];
  context?: string;
  pageRef?: number;
}

export interface RequestReviewParams {
  pageNumber: number;
  items: Array<{
    id: string;
    type: string;
    confidence: number;
    issue?: string;
  }>;
  urgency?: 'low' | 'medium' | 'high';
  reasoning?: string;
}

export interface ReviewResponse {
  approved: boolean;
  corrections?: Array<{
    itemId: string;
    field: string;
    originalValue: unknown;
    correctedValue: unknown;
  }>;
  notes?: string;
}

export interface VerifyApprovalParams {
  workspaceId: string;
  pageNumber: number;
  analysis: {
    contentType: string; // e.g., "Balance Sheet", "Table", "Text"
    confidence: number;
    findings: string[]; // Key findings from analysis
    issues?: string[]; // Any detected issues
  };
  extractions: {
    docai?: string; // DocAI markdown
    openrouter?: string; // OpenRouter/vision markdown
    'qwen-markdown'?: string; // Qwen VL markdown (preferred)
    parse?: string; // Parse CLI markdown
  };
  queueInfo?: {
    current: number;
    total: number;
    verified: number;
    flagged: number;
  };
}

export type VerifyAction = 'verify' | 'flag' | 'skip' | 'reextract';

export interface VerifyApprovalResponse {
  action: VerifyAction;
  notes?: string;
}

const pendingRequests = new Map<
  string,
  { resolve: (response: unknown) => void; reject: (error: Error) => void }
>();

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  ipcMain.handle(
    'human-input:response',
    async (_event, data: { requestId: string; response: unknown }) => {
      const pending = pendingRequests.get(data.requestId);
      if (pending) {
        pending.resolve(data.response);
        pendingRequests.delete(data.requestId);
        return { success: true };
      }
      return { success: false, error: 'No pending request found' };
    },
  );
}

function generateRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function askUser(params: AskUserParams): Promise<string> {
  ensureInitialized();

  const requestId = generateRequestId('ask');

  progressQueue.send('human-input:ask-user', {
    requestId,
    ...params,
    timestamp: Date.now(),
  });

  const response = await new Promise<unknown>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    setTimeout(
      () => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Request timed out after 5 minutes'));
        }
      },
      5 * 60 * 1000,
    );
  });

  return typeof response === 'string' ? response : JSON.stringify(response);
}

export async function requestPageReview(
  params: RequestReviewParams,
): Promise<ReviewResponse> {
  ensureInitialized();

  const requestId = generateRequestId('review');

  progressQueue.send('human-input:request-review', {
    requestId,
    ...params,
    urgency: params.urgency || 'medium',
    timestamp: Date.now(),
  });

  const response = await new Promise<unknown>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    setTimeout(
      () => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Review request timed out after 10 minutes'));
        }
      },
      10 * 60 * 1000,
    );
  });

  return response as ReviewResponse;
}

export function cancelPendingRequest(requestId: string): boolean {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    pending.reject(new Error('Request cancelled'));
    pendingRequests.delete(requestId);
    return true;
  }
  return false;
}

export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Request verification approval for a page.
 * Sends event to renderer to show side-by-side comparison (PDF vs extraction).
 * BLOCKS until user selects: Verify, Flag, Skip, or Re-extract.
 */
export async function requestVerifyApproval(
  params: VerifyApprovalParams,
): Promise<VerifyApprovalResponse> {
  ensureInitialized();

  const requestId = generateRequestId('verify');

  // Send to renderer - this will trigger the comparison view
  progressQueue.send('human-input:verify-approval', {
    requestId,
    ...params,
    timestamp: Date.now(),
  });

  const response = await new Promise<unknown>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });

    // 10 minute timeout for verification review
    setTimeout(
      () => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Verification request timed out after 10 minutes'));
        }
      },
      10 * 60 * 1000,
    );
  });

  return response as VerifyApprovalResponse;
}
