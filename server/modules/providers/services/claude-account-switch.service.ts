// Claude 多帳號切換：**委派**給 UsageMonitorForClaude 的 switch-account.ps1
//
// 為什麼不自己實作
// ----------------
// refresh token 有 rotation（輪替）：任一份憑證 refresh 成功，其他拷貝當場作廢。
// access token 每 8 小時就刷一次，所以「複製憑證去備份」的做法撐不過一天 ——
// 存起來的那份隔天切回去必定要重登。本檔的前一版正是這樣寫的，那是錯的。
//
// 唯一安全的做法是**搬移**，並維持這個不變式：
//     任一時刻，每個帳號的 .credentials.json 全機只有一份實體。
//     當前帳號那份住 ~/.claude\，其他帳號住 <accounts_dir>\<label>\。
//
// 這套邏輯（含 rollback、搬移後三重驗證、~/.claude.json 的 oauthAccount 身分區塊
// 一起搬）已經在 switch-account.ps1 裡實作且實戰驗證過。在這裡用 TypeScript 重寫
// 一遍只會得到兩套搶同一份憑證的實作，遲早漂移出災難。所以本檔只做三件事：
// 讀狀態、打 usage API、把切換動作轉交出去。
//
// 設定來源
// --------
// 完全不寫死路徑：讀 UsageMonitorForClaude 自己的設定檔
// ~/.claude/usage-monitor-settings.json 的 accounts_dir 與 switch_account_command，
// 跟托盤按鈕走同一條路。沒裝那個工具就回空清單，UI 自動隱藏切換區塊。

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'usage-monitor-settings.json');

// 切換腳本失敗時會彈一個「必須按確定」的對話框（自動關閉時間 300 秒）。從這裡叫起來時
// PC 前通常沒人（使用者在手機上），所以給 90 秒上限就砍掉，不讓 HTTP request 掛五分鐘。
// 成功路徑只發 toast、不彈框，幾秒內就會 exit 0，不受這個上限影響。
const SWITCH_TIMEOUT_MS = 90_000;

export type RateSlot = { utilization: number; resetsAt: number };

export type SavedAccount = {
  label: string;
  email: string | null;
  isActive: boolean;
  fiveHour: RateSlot | null;
  weeklyAll: RateSlot | null;
  // 快照抓取時間。前端據此顯示「N 分鐘前」，免得把過舊的數字當即時值看
  usageFetchedAt: number | null;
};

type MonitorSettings = {
  accountsDir: string;
  switchCommand: string;
};

async function readMonitorSettings(): Promise<MonitorSettings | null> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const accountsDir = typeof parsed.accounts_dir === 'string' ? parsed.accounts_dir.trim() : '';
    // switch_account_command 是字串陣列（可設多條依序跑）。切換只會有一條，取第一條。
    const commands = Array.isArray(parsed.switch_account_command) ? parsed.switch_account_command : [];
    const switchCommand = typeof commands[0] === 'string' ? commands[0].trim() : '';

    if (!accountsDir || !switchCommand) return null;
    return { accountsDir, switchCommand };
  } catch {
    return null;
  }
}

async function readJsonFile<T>(filepath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filepath, 'utf8');
    // usage-snapshot.json 是 PowerShell 寫的 → UTF-8 with BOM，不剝掉 JSON.parse 直接爆
    return JSON.parse(raw.replace(/^﻿/, '')) as T;
  } catch {
    return null;
  }
}

type SnapshotSlot = { utilization?: number; resets_at?: string | null } | null;
type UsageSnapshot = {
  fetched_at?: string;
  usage?: {
    five_hour?: SnapshotSlot;
    seven_day?: SnapshotSlot;
  } | null;
};

/**
 * 讀某個帳號的用量快照。
 *
 * **刻意不打 API**：usage-snapshot.json 是 warmup 排程器定期寫好的，UsageMonitor 自己
 * 也是讀這個檔。若改成每次列表都替每個帳號打一次 /api/oauth/usage，開一次面板或切一次
 * 帳號就是 N 個請求，跟監控 app 的輪詢疊在一起會撞 429 —— 它的托盤圖示會變成 "!"。
 * 2026-08-16 實測踩過：連續測試打了約 10 次，當場讓監控圖示閃了一下驚嘆號。
 *
 * 代價是非當前帳號的用量最舊差一個排程週期，但「另一個帳號回血了沒」本來就不需要秒級即時。
 */
function readSnapshotUsage(snapshot: UsageSnapshot | null): {
  fiveHour: RateSlot | null;
  weeklyAll: RateSlot | null;
  fetchedAt: number | null;
} {
  const conv = (slot: SnapshotSlot): RateSlot | null => {
    if (!slot || typeof slot.utilization !== 'number') return null;
    const resets = slot.resets_at ? Date.parse(slot.resets_at) : NaN;
    return { utilization: slot.utilization, resetsAt: Number.isFinite(resets) ? resets : 0 };
  };

  const fetched = snapshot?.fetched_at ? Date.parse(snapshot.fetched_at) : NaN;
  return {
    fiveHour: conv(snapshot?.usage?.five_hour ?? null),
    weeklyAll: conv(snapshot?.usage?.seven_day ?? null),
    fetchedAt: Number.isFinite(fetched) ? fetched : null,
  };
}

type AccountMeta = { email?: string; label?: string };

export const claudeAccountSwitchService = {
  /** 這台機器有沒有配好可切換的帳號（沒有的話 UI 隱藏整個切換區塊） */
  async isAvailable(): Promise<boolean> {
    return (await readMonitorSettings()) !== null;
  },

  /**
   * 列出帳號槽（label / email / 誰是當前），純檔案系統操作，不打任何 API。
   *
   * 當前帳號的判定跟 switch-account.ps1 一致：**誰的資料夾裡沒有 .credentials.json，
   * 誰就是當前帳號**（它那份被搬到 ~/.claude 去了）。不比對 token 字串 —— 那在
   * refresh 之後就對不上了。
   */
  async listSlots(): Promise<{ label: string; email: string | null; isActive: boolean; dir: string }[]> {
    const settings = await readMonitorSettings();
    if (!settings) return [];

    const dirents = await fs.readdir(settings.accountsDir, { withFileTypes: true }).catch(() => []);
    const dirs = dirents.filter((d) => d.isDirectory() && !d.name.startsWith('.'));

    const slots = await Promise.all(dirs.map(async (dir) => {
      const accountDir = path.join(settings.accountsDir, dir.name);

      // account.json 是這個資料夾屬於哪個帳號的唯一可靠來源：憑證檔頂層的 email
      // 欄位用 /login 產生時是空字串，不能用。沒有 account.json 的資料夾不是帳號槽。
      const meta = await readJsonFile<AccountMeta>(path.join(accountDir, 'account.json'));
      if (!meta) return null;

      const hasOwnCred = await fs.access(path.join(accountDir, '.credentials.json')).then(() => true, () => false);

      return {
        label: dir.name,
        email: typeof meta.email === 'string' && meta.email ? meta.email : null,
        isActive: !hasOwnCred,
        dir: accountDir,
      };
    }));

    return slots
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => a.label.localeCompare(b.label));
  },

  /** 帳號槽 + 用量（用量一律讀排程器寫好的快照，見 readSnapshotUsage 的說明） */
  async list(): Promise<SavedAccount[]> {
    const slots = await this.listSlots();

    return Promise.all(slots.map(async (slot): Promise<SavedAccount> => {
      const snapshot = await readJsonFile<UsageSnapshot>(path.join(slot.dir, 'usage-snapshot.json'));
      const usage = readSnapshotUsage(snapshot);
      return {
        label: slot.label,
        email: slot.email,
        isActive: slot.isActive,
        fiveHour: usage.fiveHour,
        weeklyAll: usage.weeklyAll,
        usageFetchedAt: usage.fetchedAt,
      };
    }));
  },

  /**
   * 切換到指定帳號 —— 整個動作交給 switch-account.ps1，本專案完全不碰憑證檔。
   *
   * label 一定要先在 list() 的結果裡出現才放行。指令是用 shell 跑的（設定檔存的是
   * 一整條含參數的命令列），這個白名單是防止 label 夾帶 shell 語法的唯一防線。
   */
  async activate(label: string): Promise<{ activatedLabel: string; output: string }> {
    const settings = await readMonitorSettings();
    if (!settings) {
      throw new Error('Account switching is not configured (no accounts_dir / switch_account_command in ~/.claude/usage-monitor-settings.json).');
    }

    // 用 listSlots 而不是 list：驗證 label 不需要用量資料，多讀幾個快照檔是白工
    const slots = await this.listSlots();
    const target = slots.find((a) => a.label === label);
    if (!target) {
      throw new Error(`Unknown account "${label}". Available: ${slots.map((a) => a.label).join(', ') || '(none)'}`);
    }
    if (target.isActive) {
      return { activatedLabel: label, output: 'Already active.' };
    }

    const command = `${settings.switchCommand} -To "${label}"`;
    const output = await runShellCommand(command, SWITCH_TIMEOUT_MS);

    return { activatedLabel: label, output };
  },
};

/**
 * 跑一條 shell 指令，超時就連同子進程一起砍掉。
 *
 * 用 taskkill /T 而不是 child.kill()：PowerShell 底下可能還掛著彈出對話框的 COM
 * 進程，只砍父進程的話那個框會留在桌面上沒人收。
 */
function runShellCommand(command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, windowsHide: true });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to run switch command: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');

      if (timedOut) {
        reject(new Error(
          `Switch command timed out after ${Math.round(timeoutMs / 1000)}s and was killed. `
          + `Check switch-account.log for what actually happened.${combined ? `\n${combined}` : ''}`,
        ));
        return;
      }
      if (code !== 0) {
        reject(new Error(combined || `Switch command exited with code ${code}.`));
        return;
      }
      resolve(combined);
    });
  });
}
