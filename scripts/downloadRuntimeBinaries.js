import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, '..');
const resourcesDir = join(projectDir, 'resources');

// Target versions
const BUN_VERSION = '1.3.3';
const UV_VERSION = '0.9.11';

// Platform and architecture detection
const PLATFORM = process.platform;
const ARCH =
  process.arch === 'x64' ? 'x64'
  : process.arch === 'arm64' ? 'aarch64'
  : process.arch;

// Platform-specific binary names
const BUN_BINARY_NAME = PLATFORM === 'win32' ? 'bun.exe' : 'bun';
const UV_BINARY_NAME = PLATFORM === 'win32' ? 'uv.exe' : 'uv';

/**
 * Reads the current version from a version file
 */
function getCurrentVersion(versionFile) {
  if (!existsSync(versionFile)) {
    return null;
  }
  try {
    return readFileSync(versionFile, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Downloads a file from a URL
 */
async function downloadFile(url, destination) {
  console.log(`Downloading from ${url}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const fileStream = createWriteStream(destination);
  await pipeline(Readable.fromWeb(response.body), fileStream);
  console.log(`Downloaded to ${destination}`);
}

/**
 * Extracts a tar.gz file using system tar command
 */
function extractTarGz(archivePath, targetDir) {
  console.log(`Extracting ${archivePath}...`);

  const result = spawnSync('tar', ['-xzf', archivePath, '-C', targetDir], {
    stdio: 'inherit',
    shell: PLATFORM === 'win32'
  });

  if (result.status !== 0) {
    throw new Error('Failed to extract tar.gz file.');
  }
}

/**
 * Extracts a zip file
 */
function extractZip(archivePath, targetDir) {
  console.log(`Extracting ${archivePath}...`);

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  if (PLATFORM === 'win32') {
    const escapedArchivePath = archivePath.replace(/"/g, '`"');
    const escapedTargetDir = targetDir.replace(/"/g, '`"');
    const result = spawnSync(
      'powershell',
      [
        '-Command',
        `$ErrorActionPreference = 'Stop'; Expand-Archive -Path "${escapedArchivePath}" -DestinationPath "${escapedTargetDir}" -Force`
      ],
      { stdio: 'inherit', shell: false }
    );
    if (result.status !== 0) {
      throw new Error(`Failed to extract zip file: PowerShell exited with code ${result.status}`);
    }
  } else {
    const result = spawnSync('unzip', ['-o', '-q', archivePath, '-d', targetDir], {
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      throw new Error(`Failed to extract zip file: unzip exited with code ${result.status}`);
    }
  }
}

/**
 * Downloads and installs bun binary
 */
async function downloadBun() {
  const bunPath = join(resourcesDir, BUN_BINARY_NAME);
  const bunVersionFile = join(resourcesDir, '.bun-version');
  const currentVersion = getCurrentVersion(bunVersionFile);

  if (existsSync(bunPath) && currentVersion === BUN_VERSION) {
    console.log(`Bun v${BUN_VERSION} already exists, skipping download.`);
    return;
  }

  console.log(`Downloading bun v${BUN_VERSION} for ${PLATFORM}-${ARCH}...`);

  const bunPlatform = PLATFORM === 'win32' ? 'windows' : PLATFORM;
  const bunArch =
    ARCH === 'x64' ? 'x64'
    : ARCH === 'aarch64' ? 'aarch64'
    : ARCH;

  const bunUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-${bunPlatform}-${bunArch}.zip`;
  const tempArchive = join(resourcesDir, 'bun.zip');
  const tempExtractDir = join(tmpdir(), `bun-temp-${randomUUID()}`);

  await downloadFile(bunUrl, tempArchive);

  if (existsSync(tempExtractDir)) {
    try {
      rmSync(tempExtractDir, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`Warning: Could not remove existing temp directory: ${error.message}`);
    }
  }

  if (!existsSync(tempExtractDir)) {
    try {
      mkdirSync(tempExtractDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create temp directory ${tempExtractDir}: ${error.message}`);
    }
  }

  extractZip(tempArchive, tempExtractDir);

  const extractedBinaryPath = join(
    tempExtractDir,
    `bun-${bunPlatform}-${bunArch}`,
    BUN_BINARY_NAME
  );
  if (!existsSync(extractedBinaryPath)) {
    throw new Error(`Extracted bun binary not found at ${extractedBinaryPath}`);
  }

  const { cpSync } = await import('fs');
  cpSync(extractedBinaryPath, bunPath);

  if (PLATFORM !== 'win32') {
    chmodSync(bunPath, 0o755);
  }

  rmSync(tempArchive);
  rmSync(tempExtractDir, { recursive: true });

  writeFileSync(bunVersionFile, BUN_VERSION);

  console.log(`✓ Bun v${BUN_VERSION} installed successfully`);
}

/**
 * Downloads and installs uv binary
 */
async function downloadUv() {
  const uvPath = join(resourcesDir, UV_BINARY_NAME);
  const uvVersionFile = join(resourcesDir, '.uv-version');
  const currentVersion = getCurrentVersion(uvVersionFile);

  if (existsSync(uvPath) && currentVersion === UV_VERSION) {
    console.log(`UV v${UV_VERSION} already exists, skipping download.`);
    return;
  }

  console.log(`Downloading uv v${UV_VERSION} for ${PLATFORM}-${ARCH}...`);

  let uvUrl;
  let archiveExt;
  let extractedDirName;

  if (PLATFORM === 'win32') {
    const uvArch = ARCH === 'x64' ? 'x86_64' : ARCH;
    uvUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uvArch}-pc-windows-msvc.zip`;
    archiveExt = '.zip';
    extractedDirName = `uv-${uvArch}-pc-windows-msvc`;
  } else if (PLATFORM === 'darwin') {
    const uvArch = ARCH === 'aarch64' ? 'aarch64' : 'x86_64';
    uvUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uvArch}-apple-${PLATFORM}.tar.gz`;
    archiveExt = '.tar.gz';
    extractedDirName = `uv-${uvArch}-apple-${PLATFORM}`;
  } else {
    const uvArch = ARCH === 'aarch64' ? 'aarch64' : 'x86_64';
    uvUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${uvArch}-unknown-linux-gnu.tar.gz`;
    archiveExt = '.tar.gz';
    extractedDirName = `uv-${uvArch}-unknown-linux-gnu`;
  }

  const tempArchive = join(resourcesDir, `uv${archiveExt}`);
  const tempExtractDir = join(tmpdir(), `uv-temp-${randomUUID()}`);

  await downloadFile(uvUrl, tempArchive);

  if (existsSync(tempExtractDir)) {
    try {
      rmSync(tempExtractDir, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`Warning: Could not remove existing temp directory: ${error.message}`);
    }
  }

  if (!existsSync(tempExtractDir)) {
    try {
      mkdirSync(tempExtractDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create temp directory ${tempExtractDir}: ${error.message}`);
    }
  }

  if (archiveExt === '.zip') {
    extractZip(tempArchive, tempExtractDir);
  } else {
    extractTarGz(tempArchive, tempExtractDir);
  }

  let extractedBinaryPath = join(tempExtractDir, extractedDirName, UV_BINARY_NAME);

  if (!existsSync(extractedBinaryPath)) {
    extractedBinaryPath = join(tempExtractDir, UV_BINARY_NAME);
  }

  if (!existsSync(extractedBinaryPath)) {
    const { readdirSync } = await import('fs');
    const entries = readdirSync(tempExtractDir, { withFileTypes: true });
    const foundBinary =
      entries.find((entry) => entry.isFile() && entry.name === UV_BINARY_NAME) ||
      entries.find(
        (entry) =>
          entry.isDirectory() && existsSync(join(tempExtractDir, entry.name, UV_BINARY_NAME))
      );

    if (foundBinary) {
      if (foundBinary.isFile()) {
        extractedBinaryPath = join(tempExtractDir, foundBinary.name);
      } else {
        extractedBinaryPath = join(tempExtractDir, foundBinary.name, UV_BINARY_NAME);
      }
    } else {
      throw new Error(
        `Extracted uv binary not found. Searched in ${tempExtractDir}. Contents: ${entries.map((e) => e.name).join(', ')}`
      );
    }
  }

  const { cpSync } = await import('fs');
  cpSync(extractedBinaryPath, uvPath);

  if (PLATFORM !== 'win32') {
    chmodSync(uvPath, 0o755);
  }

  rmSync(tempArchive);
  rmSync(tempExtractDir, { recursive: true });

  writeFileSync(uvVersionFile, UV_VERSION);

  console.log(`✓ UV v${UV_VERSION} installed successfully`);
}

/**
 * Main function
 */
async function main() {
  console.log('\n=== Downloading Runtime Binaries ===\n');

  mkdirSync(resourcesDir, { recursive: true });

  try {
    await downloadBun();
    await downloadUv();
    console.log('\n✓ All runtime binaries ready\n');
  } catch (error) {
    console.error('\n✗ Failed to download runtime binaries:', error.message);
    process.exit(1);
  }
}

const currentFile = resolve(fileURLToPath(import.meta.url));
const scriptArg = process.argv[1] ? resolve(process.argv[1]) : '';
const isMainModule =
  currentFile === scriptArg || currentFile.toLowerCase() === scriptArg.toLowerCase();

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default main;
