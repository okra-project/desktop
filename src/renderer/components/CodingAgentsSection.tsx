import React, { useState, useEffect, useCallback } from 'react';

interface DetectedAgent {
  id: string;
  name: string;
  description: string;
  command: string | null;
  website: string;
  iconColor: string;
  category: 'cli' | 'ide' | 'editor';
  installed: boolean;
  version?: string;
  foundPath?: string;
  detectedVia: 'cli' | 'config' | 'app';
}

function AgentCard({ agent }: { agent: DetectedAgent }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border border-ink/10 rounded-xl hover:border-ink/20 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${agent.installed ? 'bg-ink/5' : 'bg-ink/[0.03]'} text-ink/70`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{agent.name}</span>
            {agent.installed ? (
              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded">
                Installed
              </span>
            ) : (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-medium rounded">
                Not Detected
              </span>
            )}
            {agent.version && (
              <span className="text-[10px] text-sidebar-text font-mono">
                v{agent.version}
              </span>
            )}
          </div>
          <p className="text-xs text-sidebar-text">{agent.description}</p>
        </div>
      </div>
      <button
        onClick={() =>
          window.electron.ipcRenderer.invoke(
            'shell:open-external',
            agent.website,
          )
        }
        className="text-xs text-ink underline decoration-okra-yellow hover:opacity-80"
      >
        Learn more
      </button>
    </div>
  );
}

export default function CodingAgentsSection() {
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [detectionTime, setDetectionTime] = useState<number>(0);

  const detectAgents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'coding-agents:list-all',
      );
      setAgents(result);
      const detection = await window.electron.ipcRenderer.invoke(
        'coding-agents:detect',
      );
      setDetectionTime(detection.detectionTimeMs);
    } catch (err) {
      console.error('Failed to detect coding agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    detectAgents();
  }, [detectAgents]);

  const cliAgents = agents.filter((a) => a.category === 'cli');
  const ideAgents = agents.filter(
    (a) => a.category === 'ide' || a.category === 'editor',
  );
  const installedCount = agents.filter((a) => a.installed).length;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-purple-100 rounded-lg flex items-center justify-center text-violet-600">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">Coding Agents</h2>
            <p className="text-sm text-sidebar-text">
              {loading
                ? 'Scanning...'
                : `${installedCount} of ${agents.length} detected`}
            </p>
          </div>
        </div>
        <button
          onClick={detectAgents}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 bg-white border border-sidebar-border rounded-xl">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
            <p className="text-sm text-sidebar-text">
              Detecting installed agents...
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {cliAgents.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-sidebar-text uppercase tracking-wide mb-2 px-1">
                CLI Agents
              </h3>
              <div className="space-y-2">
                {cliAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </div>
          )}

          {ideAgents.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-sidebar-text uppercase tracking-wide mb-2 px-1">
                IDEs & Editors
              </h3>
              <div className="space-y-2">
                {ideAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-sidebar-text text-center mt-4">
        OkraPDF detects installed coding agents to suggest compatible plugins
        {detectionTime > 0 && (
          <span className="text-slate-400"> ({detectionTime}ms)</span>
        )}
      </p>
    </div>
  );
}
