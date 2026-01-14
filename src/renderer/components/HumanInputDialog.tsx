import React, { useState, useCallback } from 'react';
import type {
  PendingHumanRequest,
  McpVerifyApprovalEvent,
} from '../hooks/useMcpEvents';
import { VerifyApprovalDialog } from './VerifyApprovalDialog';

interface HumanInputDialogProps {
  pendingRequest: PendingHumanRequest | null;
  onRespond: (requestId: string, response: unknown) => Promise<void>;
  onDismiss: () => void;
}

interface AskUserData {
  requestId: string;
  question: string;
  options?: string[];
  context?: string;
  pageRef?: number;
  timestamp: number;
}

interface RequestReviewData {
  requestId: string;
  pageNumber: number;
  items: Array<{
    id: string;
    type: string;
    confidence: number;
    issue?: string;
  }>;
  urgency: 'low' | 'medium' | 'high';
  reasoning?: string;
  timestamp: number;
}

/**
 * Modal dialog for human-in-the-loop interactions.
 * Displays when agent needs user input (ask_user) or review (request_review).
 */
export function HumanInputDialog({
  pendingRequest,
  onRespond,
  onDismiss,
}: HumanInputDialogProps) {
  const [textInput, setTextInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitAskUser = useCallback(async () => {
    if (!pendingRequest || pendingRequest.type !== 'ask_user') return;

    const data = pendingRequest.data as AskUserData;
    setIsSubmitting(true);

    try {
      const response = {
        answer:
          selectedOption !== null && data.options
            ? data.options[selectedOption]
            : textInput,
        selectedOption: selectedOption ?? undefined,
      };
      await onRespond(pendingRequest.requestId, response);
      setTextInput('');
      setSelectedOption(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingRequest, textInput, selectedOption, onRespond]);

  const handleSubmitReview = useCallback(
    async (approved: boolean) => {
      if (!pendingRequest || pendingRequest.type !== 'request_review') return;

      const data = pendingRequest.data as RequestReviewData;
      setIsSubmitting(true);

      try {
        const response = {
          pageNumber: data.pageNumber,
          approved,
          corrections: [],
        };
        await onRespond(pendingRequest.requestId, response);
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingRequest, onRespond],
  );

  const handleVerifyAction = useCallback(
    async (action: 'verify' | 'flag' | 'skip' | 'reextract', notes?: string) => {
      if (!pendingRequest || pendingRequest.type !== 'verify_approval') return;

      setIsSubmitting(true);
      try {
        await onRespond(pendingRequest.requestId, { action, notes });
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingRequest, onRespond],
  );

  if (!pendingRequest) return null;

  // verify_approval is handled by DocumentViewer's integrated VerifyPanel
  // Skip rendering dialog here - the viewer shows PDF + extraction side by side
  if (pendingRequest.type === 'verify_approval') {
    return null;
  }

  const urgencyColors = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-red-50 text-red-700 border-red-200',
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-okra-yellow/20 flex items-center justify-center">
              {pendingRequest.type === 'ask_user' ? (
                <svg
                  className="w-5 h-5 text-ink"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-ink"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">
                {pendingRequest.type === 'ask_user'
                  ? 'Agent Question'
                  : 'Review Required'}
              </h2>
              <p className="text-sm text-sidebar-text">
                {pendingRequest.type === 'ask_user'
                  ? 'The agent needs your input to continue'
                  : `Page ${(pendingRequest.data as RequestReviewData).pageNumber}`}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {pendingRequest.type === 'ask_user' && (
            <AskUserContent
              data={pendingRequest.data as AskUserData}
              textInput={textInput}
              setTextInput={setTextInput}
              selectedOption={selectedOption}
              setSelectedOption={setSelectedOption}
            />
          )}

          {pendingRequest.type === 'request_review' && (
            <RequestReviewContent
              data={pendingRequest.data as RequestReviewData}
              urgencyColors={urgencyColors}
              confidenceColor={confidenceColor}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-sidebar-border bg-slate-50">
          {pendingRequest.type === 'ask_user' ? (
            <div className="flex justify-end gap-3">
              <button
                onClick={onDismiss}
                className="px-4 py-2 bg-white border border-sidebar-border hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAskUser}
                disabled={
                  isSubmitting || (!textInput && selectedOption === null)
                }
                className="px-5 py-2 bg-okra-yellow hover:bg-okra-yellow/90 text-ink rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Sending...' : 'Submit'}
              </button>
            </div>
          ) : (
            <div className="flex justify-between">
              <button
                onClick={() => handleSubmitReview(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Sending...' : 'Reject & Flag Issues'}
              </button>
              <button
                onClick={() => handleSubmitReview(true)}
                disabled={isSubmitting}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Sending...' : 'Approve'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AskUserContent({
  data,
  textInput,
  setTextInput,
  selectedOption,
  setSelectedOption,
}: {
  data: AskUserData;
  textInput: string;
  setTextInput: (v: string) => void;
  selectedOption: number | null;
  setSelectedOption: (v: number | null) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Question */}
      <p className="text-ink text-base leading-relaxed">{data.question}</p>

      {/* Context */}
      {data.context && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-sidebar-text">{data.context}</p>
        </div>
      )}

      {/* Page reference */}
      {data.pageRef && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-okra-yellow/20 text-ink text-xs font-medium rounded-full">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          Page {data.pageRef}
        </div>
      )}

      {/* Options (if provided) */}
      {data.options && data.options.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Select an option:</p>
          {data.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() =>
                setSelectedOption(idx === selectedOption ? null : idx)
              }
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                selectedOption === idx
                  ? 'border-okra-yellow bg-okra-yellow/10 ring-2 ring-okra-yellow/30'
                  : 'border-sidebar-border hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="text-sm text-ink">{option}</span>
            </button>
          ))}
        </div>
      ) : (
        /* Free text input */
        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            Your answer:
          </label>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type your response..."
            rows={3}
            className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm resize-none"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

function RequestReviewContent({
  data,
  urgencyColors,
  confidenceColor,
}: {
  data: RequestReviewData;
  urgencyColors: Record<string, string>;
  confidenceColor: (c: number) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Urgency badge */}
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${urgencyColors[data.urgency]}`}
      >
        {data.urgency === 'high' && (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {data.urgency.charAt(0).toUpperCase() + data.urgency.slice(1)} Priority
      </div>

      {/* Reasoning */}
      {data.reasoning && (
        <p className="text-ink text-sm leading-relaxed">{data.reasoning}</p>
      )}

      {/* Items to review */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Items requiring review:</p>
        <div className="space-y-2">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200"
            >
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-mono text-slate-600">
                  {item.type}
                </span>
                {item.issue && (
                  <span className="text-sm text-sidebar-text">
                    {item.issue}
                  </span>
                )}
              </div>
              <span
                className={`text-sm font-medium ${confidenceColor(item.confidence)}`}
              >
                {Math.round(item.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <p className="text-xs text-sidebar-text italic">
        Review the extracted content on page {data.pageNumber} and approve if
        correct, or reject to flag issues.
      </p>
    </div>
  );
}

export default HumanInputDialog;
