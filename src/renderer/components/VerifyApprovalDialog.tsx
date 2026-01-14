import { useState, useMemo } from 'react';
import type { McpVerifyApprovalEvent } from '../hooks/useMcpEvents';

type VerifyAction = 'verify' | 'flag' | 'skip' | 'reextract';

interface VerifyApprovalDialogProps {
  data: McpVerifyApprovalEvent;
  onRespond: (action: VerifyAction, notes?: string) => void;
  onDismiss: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-orange-100 text-orange-800 border-orange-300',
  veryLow: 'bg-red-100 text-red-800 border-red-300',
};

function getConfidenceLevel(confidence: number): {
  label: string;
  color: string;
} {
  if (confidence >= 0.95)
    return { label: 'High', color: CONFIDENCE_COLORS.high };
  if (confidence >= 0.8)
    return { label: 'Medium', color: CONFIDENCE_COLORS.medium };
  if (confidence >= 0.6) return { label: 'Low', color: CONFIDENCE_COLORS.low };
  return { label: 'Very Low', color: CONFIDENCE_COLORS.veryLow };
}

export function VerifyApprovalDialog({
  data,
  onRespond,
  onDismiss,
}: VerifyApprovalDialogProps) {
  type TabKey = 'qwen-markdown' | 'docai' | 'openrouter' | 'parse';
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // Prefer qwen-markdown, then parse, then docai
    const ext = data.extractions as Record<string, string | undefined>;
    if (ext['qwen-markdown']) return 'qwen-markdown';
    if (ext.parse) return 'parse';
    if (ext.docai) return 'docai';
    return 'openrouter';
  });

  const confidenceInfo = useMemo(
    () => getConfidenceLevel(data.analysis.confidence),
    [data.analysis.confidence],
  );

  const availableTabs = useMemo(() => {
    const ext = data.extractions as Record<string, string | undefined>;
    const tabs: Array<{ key: TabKey; label: string }> = [];
    if (ext['qwen-markdown']) tabs.push({ key: 'qwen-markdown', label: 'Qwen' });
    if (ext.docai) tabs.push({ key: 'docai', label: 'DocAI' });
    if (ext.openrouter) tabs.push({ key: 'openrouter', label: 'Vision' });
    if (ext.parse) tabs.push({ key: 'parse', label: 'Parse' });
    return tabs;
  }, [data.extractions]);

  const currentExtraction = (data.extractions as Record<string, string | undefined>)[activeTab] || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-ink">
                Page {data.pageNumber}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-lg text-slate-700">
                {data.analysis.contentType}
              </span>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium border ${confidenceInfo.color}`}
            >
              {confidenceInfo.label} ({Math.round(data.analysis.confidence * 100)}%)
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Dismiss (will timeout)"
          >
            <svg
              className="w-5 h-5 text-slate-500"
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

        {/* Analysis Summary */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Key Findings
              </h3>
              <ul className="text-sm text-slate-700 space-y-0.5">
                {data.analysis.findings.map((finding, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-green-600">✓</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
            {data.analysis.issues && data.analysis.issues.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <h3 className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">
                  Issues Detected
                </h3>
                <ul className="text-sm text-slate-700 space-y-0.5">
                  {data.analysis.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-orange-500">⚠</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Extraction Tabs */}
        {availableTabs.length > 1 && (
          <div className="px-6 py-2 border-b border-slate-200 shrink-0">
            <div className="flex gap-2">
              {availableTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-okra-yellow text-ink'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Extraction Content */}
        <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 h-full overflow-auto">
            <pre className="text-sm text-slate-800 whitespace-pre-wrap font-mono">
              {currentExtraction || 'No extraction available'}
            </pre>
          </div>
        </div>

        {/* Notes Input */}
        <div className="px-6 py-3 border-t border-slate-200 shrink-0">
          <input
            type="text"
            placeholder="Add notes (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-okra-yellow"
          />
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0 bg-slate-50 rounded-b-xl">
          <div className="text-xs text-slate-500">
            Select an action to continue verification
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onRespond('reextract', notes)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
            >
              Re-extract
            </button>
            <button
              onClick={() => onRespond('skip', notes)}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
            >
              Skip
            </button>
            <button
              onClick={() => onRespond('flag', notes)}
              className="px-4 py-2 bg-orange-100 text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium"
            >
              Flag
            </button>
            <button
              onClick={() => onRespond('verify', notes)}
              className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
            >
              ✓ Verify
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
