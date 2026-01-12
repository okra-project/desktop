export interface CodingAgentMetadata {
  id: string;
  name: string;
  description: string;
  command: string | null;
  configPaths: {
    darwin?: string;
    win32?: string;
    linux?: string;
  };
  website: string;
  iconColor: string;
  category: 'cli' | 'ide' | 'editor';
}

export interface DetectedAgent extends CodingAgentMetadata {
  installed: boolean;
  version?: string;
  foundPath?: string;
  detectedVia: 'cli' | 'config' | 'app';
}

export interface AgentDetectionResult {
  agents: DetectedAgent[];
  detectionTimeMs: number;
}
