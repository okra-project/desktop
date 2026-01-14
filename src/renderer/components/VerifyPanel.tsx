import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface VerifyRequest {
  requestId: string;
  workspaceId: string;
  pageNumber: number;
  analysis: {
    contentType: string;
    confidence: number;
    findings: string[];
    issues?: string[];
  };
  extractions: {
    docai?: string;
    openrouter?: string;
    'qwen-markdown'?: string;
    parse?: string;
  };
  timestamp: number;
}

type VerifyAction = 'verify' | 'flag' | 'skip' | 'reextract';

interface VerifyPanelProps {
  request: VerifyRequest;
  onRespond: (action: VerifyAction, notes?: string) => void;
  queueInfo?: {
    current: number;
    total: number;
    verified: number;
    flagged: number;
  };
  /** Recent agent narration messages to display */
  agentNarration?: string[];
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-green-100', text: 'text-green-700', label: 'High' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Medium' },
  low: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Low' },
  veryLow: { bg: 'bg-red-100', text: 'text-red-700', label: 'Very Low' },
};

function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.95) return CONFIDENCE_STYLES.high;
  if (confidence >= 0.8) return CONFIDENCE_STYLES.medium;
  if (confidence >= 0.6) return CONFIDENCE_STYLES.low;
  return CONFIDENCE_STYLES.veryLow;
}

export function VerifyPanel({ request, onRespond, queueInfo, agentNarration }: VerifyPanelProps) {
  type TabKey = 'qwen-markdown' | 'docai' | 'openrouter' | 'parse';
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // Prefer qwen-markdown, then parse, then docai
    if (request.extractions['qwen-markdown']) return 'qwen-markdown';
    if (request.extractions.parse) return 'parse';
    if (request.extractions.docai) return 'docai';
    return 'openrouter';
  });
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNarration, setShowNarration] = useState(true);
  const narrationRef = useRef<HTMLDivElement>(null);

  // Handler for verification actions - defined early for useEffect
  const handleAction = useCallback(async (action: VerifyAction) => {
    setIsSubmitting(true);
    try {
      onRespond(action, notes || undefined);
    } finally {
      setIsSubmitting(false);
    }
  }, [onRespond, notes]);

  // Auto-scroll narration to bottom when new messages arrive
  useEffect(() => {
    if (narrationRef.current && agentNarration?.length) {
      narrationRef.current.scrollTop = narrationRef.current.scrollHeight;
    }
  }, [agentNarration]);

  // Keyboard shortcuts for fast verification flow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (isSubmitting) return;

      switch (e.key.toLowerCase()) {
        case 'enter':
        case 'v':
          e.preventDefault();
          handleAction('verify');
          break;
        case 'f':
          e.preventDefault();
          handleAction('flag');
          break;
        case 's':
          e.preventDefault();
          handleAction('skip');
          break;
        case 'r':
          e.preventDefault();
          handleAction('reextract');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, handleAction]);

  // Calculate progress percentage
  const progressPercent = queueInfo
    ? Math.round(((queueInfo.verified + queueInfo.flagged) / queueInfo.total) * 100)
    : 0;

  const confidenceStyle = useMemo(
    () => getConfidenceStyle(request.analysis.confidence),
    [request.analysis.confidence],
  );

  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: TabKey; label: string }> = [];
    if (request.extractions['qwen-markdown']) tabs.push({ key: 'qwen-markdown', label: 'Qwen' });
    if (request.extractions.docai) tabs.push({ key: 'docai', label: 'DocAI' });
    if (request.extractions.openrouter) tabs.push({ key: 'openrouter', label: 'Vision' });
    if (request.extractions.parse) tabs.push({ key: 'parse', label: 'Parse' });
    return tabs;
  }, [request.extractions]);

  const currentExtraction = request.extractions[activeTab] || 'No extraction available';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Session Header with Progress */}
      <div className="border-b border-slate-200 bg-okra-yellow/20 shrink-0">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-ink">Verification Mode</span>
            {queueInfo && (
              <span className="text-xs text-slate-600 ml-2">
                {progressPercent}% complete
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {queueInfo && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-600">
                  {queueInfo.current}/{queueInfo.total}
                </span>
                <span className="text-green-600 font-medium">
                  {queueInfo.verified} verified
                </span>
                {queueInfo.flagged > 0 && (
                  <span className="text-orange-600 font-medium">
                    {queueInfo.flagged} flagged
                  </span>
                )}
              </div>
            )}
            {agentNarration && agentNarration.length > 0 && (
              <button
                onClick={() => setShowNarration(!showNarration)}
                className={`p-1 rounded text-xs transition-colors ${
                  showNarration ? 'bg-okra-yellow text-ink' : 'bg-slate-100 text-slate-600'
                }`}
                title={showNarration ? 'Hide agent narration' : 'Show agent narration'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Progress bar toward 100% */}
        {queueInfo && (
          <div className="h-1 bg-okra-yellow/30">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Agent Narration - collapsible */}
      {agentNarration && agentNarration.length > 0 && showNarration && (
        <div className="border-b border-slate-200 bg-slate-50 shrink-0">
          <div
            ref={narrationRef}
            className="px-4 py-2 max-h-24 overflow-auto text-xs text-slate-700 space-y-1"
          >
            {agentNarration.slice(-3).map((msg, i) => (
              <p key={i} className="leading-relaxed">
                <span className="text-okra-yellow font-medium">Agent:</span> {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-ink">
              Page {request.pageNumber}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${confidenceStyle.bg} ${confidenceStyle.text}`}
            >
              {confidenceStyle.label} ({Math.round(request.analysis.confidence * 100)}%)
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-600">{request.analysis.contentType}</p>
      </div>

      {/* Analysis Summary */}
      <div className="px-4 py-2 border-b border-slate-200 shrink-0">
        <div className="flex gap-4 text-xs">
          <div className="flex-1">
            <span className="font-medium text-slate-500">Findings:</span>
            <ul className="mt-1 space-y-0.5">
              {request.analysis.findings.slice(0, 3).map((f, i) => (
                <li key={i} className="text-slate-700 flex items-start gap-1">
                  <span className="text-green-500">✓</span>
                  <span className="line-clamp-1">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          {request.analysis.issues && request.analysis.issues.length > 0 && (
            <div className="flex-1">
              <span className="font-medium text-orange-600">Issues:</span>
              <ul className="mt-1 space-y-0.5">
                {request.analysis.issues.slice(0, 3).map((issue, i) => (
                  <li key={i} className="text-slate-700 flex items-start gap-1">
                    <span className="text-orange-500">!</span>
                    <span className="line-clamp-1">{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Extraction Tabs */}
      {availableTabs.length > 1 && (
        <div className="px-4 py-2 border-b border-slate-200 shrink-0 flex gap-1">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-okra-yellow text-ink'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Extraction Content with Markdown Rendering */}
      <div className="flex-1 overflow-auto p-4 min-h-0">
        <div className="bg-slate-50 rounded border border-slate-200 p-3 h-full overflow-auto prose prose-sm prose-slate max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <table className="w-full border-collapse text-xs my-2">{children}</table>
              ),
              thead: ({ children }) => (
                <thead className="bg-slate-200">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="border border-slate-300 px-2 py-1 text-left font-medium">{children}</th>
              ),
              td: ({ children }) => (
                <td className="border border-slate-300 px-2 py-1">{children}</td>
              ),
              p: ({ children }) => (
                <p className="text-xs text-slate-700 my-1">{children}</p>
              ),
              h1: ({ children }) => (
                <h1 className="text-sm font-bold text-slate-800 my-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-sm font-semibold text-slate-800 my-2">{children}</h2>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside text-xs my-1">{children}</ul>
              ),
              li: ({ children }) => (
                <li className="text-xs text-slate-700">{children}</li>
              ),
            }}
          >
            {currentExtraction}
          </ReactMarkdown>
        </div>
      </div>

      {/* Notes Input */}
      <div className="px-4 py-2 border-t border-slate-200 shrink-0">
        <input
          type="text"
          placeholder="Add notes (optional)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-okra-yellow"
        />
      </div>

      {/* Action Buttons with keyboard hints */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('reextract')}
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-sm font-medium hover:bg-slate-300 disabled:opacity-50 transition-colors group"
            title="Keyboard: R"
          >
            Re-extract
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-slate-300 text-slate-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">R</kbd>
          </button>
          <button
            onClick={() => handleAction('skip')}
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-sm font-medium hover:bg-slate-300 disabled:opacity-50 transition-colors group"
            title="Keyboard: S"
          >
            Skip
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-slate-300 text-slate-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">S</kbd>
          </button>
          <button
            onClick={() => handleAction('flag')}
            disabled={isSubmitting}
            className="px-3 py-1.5 bg-orange-100 text-orange-700 border border-orange-200 rounded text-sm font-medium hover:bg-orange-200 disabled:opacity-50 transition-colors group"
            title="Keyboard: F"
          >
            Flag
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-orange-200 text-orange-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">F</kbd>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => handleAction('verify')}
            disabled={isSubmitting}
            className="px-5 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors group"
            title="Keyboard: Enter or V"
          >
            Verify
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-green-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity">Enter</kbd>
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">
          Use keyboard: <kbd className="px-1 bg-slate-100 rounded">Enter</kbd> verify, <kbd className="px-1 bg-slate-100 rounded">F</kbd> flag, <kbd className="px-1 bg-slate-100 rounded">S</kbd> skip
        </p>
      </div>
    </div>
  );
}
