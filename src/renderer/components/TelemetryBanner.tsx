/**
 * Telemetry Consent Banner
 *
 * Shows a non-intrusive prompt asking users if they want to help improve OkraPDF
 * by sharing anonymous usage data. Follows the Jan/Dyad pattern.
 */
import { useState, useEffect } from 'react';
import {
  hasBeenAskedForConsent,
  setTelemetryConsent,
  getTelemetryConsent,
} from '../lib/posthog';

export default function TelemetryBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Small delay to avoid showing immediately on app launch
    const timer = setTimeout(() => {
      // Only show if user hasn't been asked yet
      if (!hasBeenAskedForConsent()) {
        setShow(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleConsent = async (allowed: boolean) => {
    await setTelemetryConsent(allowed);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-white rounded-lg shadow-lg border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">📊</div>
        <div className="flex-1">
          <h3 className="font-medium text-slate-800 mb-1">
            Help improve <span className="font-serif">OkraPDF</span>
          </h3>
          <p className="text-sm text-slate-600 mb-3">
            Share anonymous usage data to help us understand how features are used.
            Your documents and personal info are never tracked.
          </p>
          <p className="text-xs text-slate-500 mb-3">
            You can change this anytime in Settings.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => handleConsent(false)}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              No thanks
            </button>
            <button
              onClick={() => handleConsent(true)}
              className="px-3 py-1.5 text-sm bg-okra-yellow text-ink rounded-md hover:bg-okra-yellow-hover transition-colors font-medium border border-ink/10 shadow-sm"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
