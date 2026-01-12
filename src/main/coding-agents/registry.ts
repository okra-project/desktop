import type { CodingAgentMetadata } from './types';

export const CODING_AGENT_REGISTRY: readonly CodingAgentMetadata[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's official agentic coding CLI",
    command: 'claude',
    configPaths: {
      darwin: '~/.claude.json',
      win32: '%USERPROFILE%\\.claude.json',
      linux: '~/.claude.json',
    },
    website: 'https://claude.ai/code',
    iconColor: 'text-amber-600',
    category: 'cli',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open source AI coding agent',
    command: 'opencode',
    configPaths: {
      darwin: '~/.config/opencode/opencode.json',
      win32: '%APPDATA%\\opencode\\opencode.json',
      linux: '~/.config/opencode/opencode.json',
    },
    website: 'https://opencode.ai',
    iconColor: 'text-emerald-600',
    category: 'cli',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    description: 'Lightweight coding agent from OpenAI',
    command: 'codex',
    configPaths: {
      darwin: '~/.codex/',
      win32: '%USERPROFILE%\\.codex\\',
      linux: '~/.codex/',
    },
    website: 'https://github.com/openai/codex',
    iconColor: 'text-green-600',
    category: 'cli',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google AI agent with 1M token context',
    command: 'gemini',
    configPaths: {
      darwin: '~/.gemini/',
      win32: '%USERPROFILE%\\.gemini\\',
      linux: '~/.gemini/',
    },
    website: 'https://github.com/google-gemini/gemini-cli',
    iconColor: 'text-blue-600',
    category: 'cli',
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in your terminal',
    command: 'aider',
    configPaths: {
      darwin: '~/.aider.conf.yml',
      win32: '%USERPROFILE%\\.aider.conf.yml',
      linux: '~/.aider.conf.yml',
    },
    website: 'https://aider.chat',
    iconColor: 'text-purple-600',
    category: 'cli',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-first code editor',
    command: null,
    configPaths: {
      darwin: '~/.cursor/mcp.json',
      win32: '%USERPROFILE%\\.cursor\\mcp.json',
      linux: '~/.cursor/mcp.json',
    },
    website: 'https://cursor.sh',
    iconColor: 'text-slate-700',
    category: 'ide',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Codeium AI-powered IDE',
    command: null,
    configPaths: {
      darwin: '~/.codeium/windsurf/mcp_config.json',
      win32: '%APPDATA%\\codeium\\windsurf\\mcp_config.json',
      linux: '~/.codeium/windsurf/mcp_config.json',
    },
    website: 'https://codeium.com/windsurf',
    iconColor: 'text-cyan-600',
    category: 'ide',
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: "Anthropic's desktop app with MCP support",
    command: null,
    configPaths: {
      darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
      win32: '%APPDATA%\\Claude\\claude_desktop_config.json',
      linux: '~/.config/Claude/claude_desktop_config.json',
    },
    website: 'https://claude.ai/download',
    iconColor: 'text-amber-500',
    category: 'ide',
  },
  {
    id: 'zed',
    name: 'Zed',
    description: 'High-performance editor with AI assistant',
    command: 'zed',
    configPaths: {
      darwin: '~/.config/zed/settings.json',
      win32: '%APPDATA%\\Zed\\settings.json',
      linux: '~/.config/zed/settings.json',
    },
    website: 'https://zed.dev',
    iconColor: 'text-blue-500',
    category: 'editor',
  },
] as const;

export function getAgentsForPlatform(): CodingAgentMetadata[] {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  return CODING_AGENT_REGISTRY.filter(
    (agent) => agent.configPaths[platform] !== undefined,
  );
}
