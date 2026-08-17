import os from 'node:os';
import path from 'node:path';

import { SkillsProvider } from '@/modules/providers/shared/skills/skills.provider.js';
import { getGrokHome } from '@/shared/grok-executable.js';
import type { ProviderSkillSource } from '@/shared/types.js';

export class GrokSkillsProvider extends SkillsProvider {
  constructor() {
    super('grok');
  }

  /**
   * Grok also reads Claude and Cursor skill directories for compatibility, but
   * those are already surfaced by their own providers — listing them here would
   * duplicate every entry in the slash command menu.
   */
  protected async getSkillSources(workspacePath: string): Promise<ProviderSkillSource[]> {
    const grokHome = getGrokHome();

    return [
      {
        scope: 'user',
        rootDir: path.join(grokHome, 'skills'),
        commandPrefix: '/',
      },
      {
        scope: 'user',
        rootDir: path.join(grokHome, 'bundled', 'skills'),
        commandPrefix: '/',
      },
      {
        scope: 'user',
        rootDir: path.join(os.homedir(), '.agents', 'skills'),
        commandPrefix: '/',
      },
      {
        scope: 'project',
        rootDir: path.join(workspacePath, '.grok', 'skills'),
        commandPrefix: '/',
      },
      {
        scope: 'project',
        rootDir: path.join(workspacePath, '.agents', 'skills'),
        commandPrefix: '/',
      },
    ];
  }
}
