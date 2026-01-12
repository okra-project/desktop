import { exec } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';
import type {
  CodingAgentMetadata,
  DetectedAgent,
  AgentDetectionResult,
} from './types';
import { getAgentsForPlatform } from './registry';

const execAsync = promisify(exec);

function expandPath(configPath: string): string {
  let expanded = configPath
    .replace(/^~/, homedir())
    .replace(/%USERPROFILE%/gi, homedir())
    .replace(
      /%APPDATA%/gi,
      process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'),
    );

  return path.normalize(expanded);
}

async function checkCliCommand(command: string): Promise<{
  found: boolean;
  version?: string;
}> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    await execAsync(`${whichCmd} ${command}`, { timeout: 2000 });

    try {
      const { stdout } = await execAsync(`${command} --version`, {
        timeout: 5000,
      });
      const versionMatch = stdout.trim().match(/(\d+\.\d+\.?\d*)/);
      return { found: true, version: versionMatch?.[1] };
    } catch {
      return { found: true };
    }
  } catch {
    return { found: false };
  }
}

function checkConfigExists(agent: CodingAgentMetadata): {
  exists: boolean;
  path?: string;
} {
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  const configPath = agent.configPaths[platform];

  if (!configPath) {
    return { exists: false };
  }

  const expandedPath = expandPath(configPath);
  const exists = existsSync(expandedPath);

  return { exists, path: exists ? expandedPath : undefined };
}

async function detectSingleAgent(
  agent: CodingAgentMetadata,
): Promise<DetectedAgent | null> {
  const configCheck = checkConfigExists(agent);

  if (agent.command) {
    const cliCheck = await checkCliCommand(agent.command);
    if (cliCheck.found) {
      return {
        ...agent,
        installed: true,
        version: cliCheck.version,
        foundPath: configCheck.path,
        detectedVia: 'cli',
      };
    }
  }

  if (configCheck.exists) {
    return {
      ...agent,
      installed: true,
      foundPath: configCheck.path,
      detectedVia: 'config',
    };
  }

  return null;
}

export async function detectInstalledAgents(): Promise<AgentDetectionResult> {
  const startTime = Date.now();
  const agents = getAgentsForPlatform();

  const detectionPromises = agents.map(detectSingleAgent);
  const results = await Promise.all(detectionPromises);

  const detectedAgents = results.filter((a): a is DetectedAgent => a !== null);

  return {
    agents: detectedAgents,
    detectionTimeMs: Date.now() - startTime,
  };
}

export async function getAllAgentsWithStatus(): Promise<DetectedAgent[]> {
  const agents = getAgentsForPlatform();

  const detectionPromises = agents.map(
    async (agent): Promise<DetectedAgent> => {
      const detected = await detectSingleAgent(agent);
      if (detected) {
        return detected;
      }
      return {
        ...agent,
        installed: false,
        detectedVia: 'config',
      };
    },
  );

  return Promise.all(detectionPromises);
}
