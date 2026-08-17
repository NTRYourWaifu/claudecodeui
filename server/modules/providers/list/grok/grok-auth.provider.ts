import fs from 'node:fs';
import path from 'node:path';

import spawn from 'cross-spawn';

import { getGrokHome, resolveGrokExecutable } from '@/shared/grok-executable.js';
import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';

type GrokLoginStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

/**
 * `grok models` prints the account line before the model list, e.g.
 * "You are logged in with grok.com." or "You are logged in with an API key."
 */
const LOGIN_LINE = /You are logged in with ([^.\n]+)/i;

export class GrokProviderAuth implements IProviderAuth {
  /**
   * Checks whether the grok CLI is available on this host.
   */
  private checkInstalled(): boolean {
    try {
      const result = spawn.sync(resolveGrokExecutable(), ['--version'], {
        stdio: 'ignore',
        timeout: 5000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Returns Grok CLI installation and login status.
   */
  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();

    if (!installed) {
      return {
        installed,
        provider: 'grok',
        authenticated: false,
        email: null,
        method: null,
        error: 'Grok CLI is not installed',
      };
    }

    const login = await this.checkGrokLogin();

    return {
      installed,
      provider: 'grok',
      authenticated: login.authenticated,
      email: login.email,
      method: login.method,
      error: login.authenticated ? undefined : login.error || 'Not logged in',
    };
  }

  /**
   * Reports whether `~/.grok/auth.json` holds at least one credential entry.
   *
   * Used as the fallback verdict when the CLI probe times out, so a slow host
   * doesn't make an authenticated account look logged out.
   */
  private hasStoredCredentials(): boolean {
    try {
      const raw = fs.readFileSync(path.join(getGrokHome(), 'auth.json'), 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.keys(parsed).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Runs `grok models` and parses the login marker from stdout.
   */
  private checkGrokLogin(): Promise<GrokLoginStatus> {
    return new Promise((resolve) => {
      let processCompleted = false;
      let childProcess: ReturnType<typeof spawn> | undefined;

      const timeout = setTimeout(() => {
        if (processCompleted) {
          return;
        }
        processCompleted = true;
        childProcess?.kill();

        const stored = this.hasStoredCredentials();
        resolve({
          authenticated: stored,
          email: null,
          method: stored ? 'cli' : null,
          error: stored ? undefined : 'Command timeout',
        });
      }, 8000);

      try {
        childProcess = spawn(resolveGrokExecutable(), ['models']);
      } catch {
        clearTimeout(timeout);
        processCompleted = true;
        resolve({
          authenticated: false,
          email: null,
          method: null,
          error: 'Grok CLI not found or not installed',
        });
        return;
      }

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (processCompleted) {
          return;
        }
        processCompleted = true;
        clearTimeout(timeout);

        const loginMatch = stdout.match(LOGIN_LINE);
        if (code === 0 && loginMatch?.[1]) {
          resolve({ authenticated: true, email: null, method: loginMatch[1].trim() });
          return;
        }

        if (code === 0 && this.hasStoredCredentials()) {
          resolve({ authenticated: true, email: null, method: 'cli' });
          return;
        }

        resolve({
          authenticated: false,
          email: null,
          method: null,
          error: stderr.trim() || 'Not logged in',
        });
      });

      childProcess.on('error', () => {
        if (processCompleted) {
          return;
        }
        processCompleted = true;
        clearTimeout(timeout);

        resolve({
          authenticated: false,
          email: null,
          method: null,
          error: 'Grok CLI not found or not installed',
        });
      });
    });
  }
}
