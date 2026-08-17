import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Grok Build installs itself into `~/.grok/bin` and adds that directory to the
 * user's PATH. Services started outside a login shell (Windows autostart, task
 * scheduler) frequently miss that PATH entry, so fall back to the well-known
 * install location before giving up and letting `spawn` resolve a bare `grok`.
 */
const BUNDLED_BIN_NAME = process.platform === 'win32' ? 'grok.exe' : 'grok';

let cachedExecutable: string | null = null;

/**
 * Returns the grok executable to spawn, preferring the bundled install path.
 */
export function resolveGrokExecutable(): string {
  if (cachedExecutable) {
    return cachedExecutable;
  }

  const bundled = path.join(os.homedir(), '.grok', 'bin', BUNDLED_BIN_NAME);
  cachedExecutable = fs.existsSync(bundled) ? bundled : 'grok';
  return cachedExecutable;
}

/**
 * Root of the Grok home directory that holds auth, config, and session data.
 */
export function getGrokHome(): string {
  return path.join(os.homedir(), '.grok');
}
