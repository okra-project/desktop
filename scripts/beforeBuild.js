import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from 'fs';
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
  const outNodeModulesDir = join(projectDir, 'release/app/dist/node_modules');

  // Ensure output directory exists
  if (!existsSync(outNodeModulesDir)) {
    mkdirSync(outNodeModulesDir, { recursive: true });
  }

  // Track which dependencies we've already copied to avoid duplicates
  const copiedDeps = new Set();

  // Recursively copy a dependency and its transitive dependencies
  function copyDependency(depName, isOptional = false) {
    if (copiedDeps.has(depName)) {
      return;
    }

    const sourceDir = join(nodeModulesDir, depName);
    const targetDir = join(outNodeModulesDir, depName);

    if (!existsSync(sourceDir)) {
      if (isOptional) {
        console.log(`- Skipping optional dependency ${depName} (not installed on this platform)`);
        return;
      }
      // Not all deps need to be copied - some are bundled by webpack
      return;
    }

    mkdirSync(dirname(targetDir), { recursive: true });
    cpSync(sourceDir, targetDir, {
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

  // Copy SDK dependencies that need to be unpacked from asar
  const sdkDeps = ['@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-code'];
  for (const depName of sdkDeps) {
    if (existsSync(join(nodeModulesDir, depName))) {
      copyDependency(depName, false);
    }
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
