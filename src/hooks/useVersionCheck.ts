import { version } from '../../package.json';
import { ReleaseInfo } from '../types/sharedTypes';

export type InstallMode = 'git' | 'npm';

type VersionCheckResult = {
  updateAvailable: boolean;
  latestVersion: string | null;
  currentVersion: string;
  releaseInfo: ReleaseInfo | null;
  installMode: InstallMode;
};

/**
 * Auto-update is DISABLED in this fork. See docs/待辦總表.md section 2.
 *
 * Upstream's update flow runs `git checkout main && git pull && npm install` on
 * the server (server/index.js, /api/system/update). On this machine that is
 * destructive rather than helpful:
 *
 *   1. Reinstalling dependencies overwrites the cross-drive cwd patch inside
 *      node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs. Without that patch
 *      claude.exe cannot be spawned at all, so chat stops working entirely.
 *   2. This fork is ~161 commits behind upstream and carries local work on top,
 *      so pulling either conflicts or leaves a half-merged tree.
 *
 * Rather than delete the version UI wholesale, this hook is reduced to a stub
 * that reports "no update available". Every downstream consumer (sidebar
 * banner, upgrade modal trigger, settings tabs) then renders nothing on its
 * own, and the *displayed* version number keeps working.
 *
 * The explicit return type matters: without it TypeScript narrows the literal
 * `false`/`null` values and callers such as AboutTab fail to compile against a
 * `never`-typed releaseInfo.
 *
 * Upstream changes are cherry-picked by hand instead — see docs/待辦總表.md
 * section 12 for the audited candidate list.
 */
export const useVersionCheck = (_owner: string, _repo: string): VersionCheckResult => ({
  updateAvailable: false,
  latestVersion: null,
  currentVersion: version,
  releaseInfo: null,
  installMode: 'git',
});
