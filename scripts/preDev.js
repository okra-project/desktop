/**
 * Pre-dev script that ensures runtimes and skills are ready before starting dev server.
 * This provides consistency between dev and production builds.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, symlinkSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, '..');
const resourcesDir = join(projectDir, 'resources');
const PLATFORM = process.platform;

async function main() {
  console.log('\n=== Pre-Dev Setup ===\n');

  // Step 1: Download runtime binaries (bun, uv)
  console.log('Step 1: Downloading runtime binaries...');
  const downloadResult = spawnSync('node', [join(__dirname, 'downloadRuntimeBinaries.js')], {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (downloadResult.status !== 0) {
    console.error('Failed to download runtime binaries');
    process.exit(1);
  }

  // Step 2: Create node symlink to bun (for #!/usr/bin/env node shebangs)
  if (PLATFORM !== 'win32') {
    const bunPath = join(resourcesDir, 'bun');
    const nodePath = join(resourcesDir, 'node');

    if (existsSync(bunPath)) {
      if (existsSync(nodePath)) {
        try { unlinkSync(nodePath); } catch { /* ignore */ }
      }
      try {
        symlinkSync('bun', nodePath);
        console.log('Step 2: Created node -> bun symlink');
      } catch (error) {
        console.warn('Could not create node symlink:', error.message);
      }
    }
  }

  // Step 3: Build skills
  console.log('Step 3: Building skills...');
  const buildSkillsScript = join(__dirname, 'buildSkills.js');

  if (existsSync(buildSkillsScript)) {
    const skillsResult = spawnSync('node', [buildSkillsScript], {
      cwd: projectDir,
      stdio: 'inherit'
    });

    if (skillsResult.status !== 0) {
      console.error('Failed to build skills');
      process.exit(1);
    }
  } else {
    console.log('No buildSkills.js found, skipping...');
  }

  console.log('\n=== Pre-Dev Setup Complete ===\n');
}

main().catch((error) => {
  console.error('Pre-dev setup failed:', error);
  process.exit(1);
});
