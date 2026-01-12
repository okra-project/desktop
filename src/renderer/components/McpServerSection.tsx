import React, { useState, useEffect, useCallback } from 'react';
import { Server, Copy, Check } from 'lucide-react';

interface McpStatus {
  enabled: boolean;
  port: number;
  running: boolean;
}

export default function McpServerSection() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portInput, setPortInput] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('mcp:get-status');
      setStatus(result);
      setPortInput(String(result.port));
    } catch (err) {
      console.error('Failed to load MCP status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = async () => {
    if (!status) return;
    setSaving(true);
    try {
      const newEnabled = !status.enabled;
      await window.electron.ipcRenderer.invoke('mcp:set-settings', {
        enabled: newEnabled,
        port: status.port,
      });
      await loadStatus();
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePortChange = async () => {
    if (!status) return;
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
      return;
    }
    setSaving(true);
    try {
      await window.electron.ipcRenderer.invoke('mcp:set-settings', {
        enabled: status.enabled,
        port: newPort,
      });
      await loadStatus();
    } catch (err) {
      console.error('Failed to update MCP port:', err);
    } finally {
      setSaving(false);
    }
  };

  const copyEndpoint = () => {
    if (!status) return;
    navigator.clipboard.writeText(`http://localhost:${status.port}/mcp`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-sidebar-border p-4 mb-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
            <div className="h-3 bg-slate-200 rounded w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="bg-white rounded-xl border border-sidebar-border p-4 mb-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Server className="w-5 h-5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-ink">MCP Server</h3>
            <button
              onClick={handleToggle}
              disabled={saving}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                status.enabled ? 'bg-green-500' : 'bg-slate-300'
              } ${saving ? 'opacity-50' : ''}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  status.enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <p className="text-sm text-sidebar-text mb-3">
            Expose your workspaces to AI coding agents via Model Context
            Protocol
          </p>

          {status.enabled && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${status.running ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="text-sm text-sidebar-text">
                  {status.running ? 'Running' : 'Stopped'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-sidebar-text">Port:</label>
                <input
                  type="number"
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value)}
                  onBlur={handlePortChange}
                  onKeyDown={(e) => e.key === 'Enter' && handlePortChange()}
                  min={1024}
                  max={65535}
                  className="w-24 px-2 py-1 text-sm border border-sidebar-border rounded focus:outline-none focus:ring-1 focus:ring-okra-yellow"
                />
              </div>

              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                <code className="text-xs text-slate-600 flex-1 truncate">
                  http://localhost:{status.port}/mcp
                </code>
                <button
                  onClick={copyEndpoint}
                  className="p-1 hover:bg-slate-200 rounded transition-colors"
                  title="Copy endpoint"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              </div>

              <p className="text-xs text-sidebar-text">
                Add this endpoint to Claude Desktop, Cursor, or other MCP
                clients.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
