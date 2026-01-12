import { spawnSync } from 'child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM = process.platform;

export default async function beforeBuild(_context) {
  const projectDir = join(__dirname, '..');
  const resourcesDir = join(projectDir, 'resources');

  // Step 1: Download runtime binaries (bun, uv)
  console.log('Downloading runtime binaries...');
  const downloadBinariesScript = join(__dirname, 'downloadRuntimeBinaries.js');
  const downloadResult = spawnSync('node', [downloadBinariesScript], {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (downloadResult.status !== 0) {
    throw new Error('Failed to download runtime binaries');
  }

  // Step 2: Create node symlink to bun (so #!/usr/bin/env node shebangs work)
  if (PLATFORM !== 'win32') {
    const bunPath = join(resourcesDir, 'bun');
    const nodePath = join(resourcesDir, 'node');

    if (existsSync(bunPath)) {
      // Remove existing symlink if present
      if (existsSync(nodePath)) {
        try { unlinkSync(nodePath); } catch { /* ignore */ }
      }
      // Create symlink: node -> bun
      try {
        symlinkSync('bun', nodePath);
        console.log('Created node -> bun symlink');
      } catch (error) {
        console.warn('Could not create node symlink:', error.message);
      }
    }
  }

  // Step 2: Copy runtime dependencies (SDK + native bindings)
  console.log('Copying runtime dependencies to release/app/node_modules...');

  const pkgJson = JSON.parse(readFileSync(join(projectDir, 'release/app/package.json'), 'utf-8'));
  const runtimeDeps = new Set(Object.keys(pkgJson.dependencies ?? {}));

  const nodeModulesDir = join(projectDir, 'release/app/node_modules');
  // Copy directly to node_modules (overwriting pnpm symlinks with dereferenced content)
  const outNodeModulesDir = nodeModulesDir;

  // Track which dependencies we've already copied to avoid duplicates
  const copiedDeps = new Set();

  function copyDependency(depName, isOptional = false) {
    if (copiedDeps.has(depName)) {
      return;
    }

    const targetDir = join(outNodeModulesDir, depName);
    const sourceDir = join(nodeModulesDir, depName);

    if (!existsSync(sourceDir)) {
      if (isOptional) {
        console.log(`- Skipping optional dependency ${depName} (not installed on this platform)`);
        return;
      }
      return;
    }

    const stat = lstatSync(sourceDir);
    if (!stat.isSymbolicLink()) {
      copiedDeps.add(depName);
      return;
    }

    const realSourceDir = realpathSync(sourceDir);
    rmSync(sourceDir, { recursive: true, force: true });

    mkdirSync(dirname(targetDir), { recursive: true });
    cpSync(realSourceDir, targetDir, {
      recursive: true,
      dereference: true,
      force: true
    });

    copiedDeps.add(depName);
    console.log(`- Copied ${depName}`);

    // Read the dependency's package.json to find its dependencies
    const depPkgJsonPath = join(sourceDir, 'package.json');
    if (existsSync(depPkgJsonPath)) {
      try {
        const depPkgJson = JSON.parse(readFileSync(depPkgJsonPath, 'utf-8'));
        const depDependencies = depPkgJson.dependencies ?? {};
        const depOptionalDeps = depPkgJson.optionalDependencies ?? {};

        for (const depDepName of Object.keys(depDependencies)) {
          copyDependency(depDepName, false);
        }

        for (const depDepName of Object.keys(depOptionalDeps)) {
          copyDependency(depDepName, true);
        }
      } catch (error) {
        console.warn(`- Warning: Failed to read package.json for ${depName}:`, error.message);
      }
    }
  }

  const sdkDeps = [
    '@anthropic-ai/claude-agent-sdk',
    '@anthropic-ai/claude-code',
    '@napi-rs/canvas',
    '@napi-rs/canvas-darwin-arm64',
    '@napi-rs/canvas-darwin-x64',
    'pdfjs-dist',
  ];
  for (const depName of sdkDeps) {
    if (existsSync(join(nodeModulesDir, depName))) {
      copyDependency(depName, false);
    }
  }

  const pnpmDir = join(nodeModulesDir, '.pnpm');
  if (existsSync(pnpmDir)) {
    rmSync(pnpmDir, { recursive: true, force: true });
    console.log('- Removed .pnpm directory');
  }

  // Step 4: Compile skills from project root
  console.log('\nCompiling Claude skills...');
  const buildSkillsScript = join(__dirname, 'buildSkills.js');
  if (existsSync(buildSkillsScript)) {
    const skillsResult = spawnSync('bun', [buildSkillsScript], {
      cwd: projectDir,
      stdio: 'inherit'
    });

    if (skillsResult.status !== 0) {
      console.warn('Warning: Failed to compile skills (non-fatal)');
    }
  } else {
    console.log('No buildSkills.js found, skipping skills compilation');
  }

  console.log('\n✓ beforeBuild complete\n');
}
