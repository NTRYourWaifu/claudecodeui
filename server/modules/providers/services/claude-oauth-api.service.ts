// 直接從 Anthropic OAuth API 拿真實 usage / profile
//
// VSCode 擴充就是打這兩個 endpoint，所以資料一定跟 VSCode 對得上：
//   GET /api/oauth/usage   → 5hr / 7day utilization + reset 時間 + overage
//   GET /api/oauth/profile → email / has_pro / has_max / organization
//
// SDK 本身不會 emit rate_limit_event（沒實作），我們之前等 SDK push 永遠拿不到。
//
// 加 1.5 秒 in-memory cache，避免每次開 panel 都重打 Anthropic API。

import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readObjectRecord, readOptionalString } from '@/shared/utils.js';

const OAUTH_BASE = 'https://api.anthropic.com';
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const CACHE_TTL_MS = 1500;

type ClaudeUsage = {
  five_hour?: { utilization?: number; resets_at?: string } | null;
  seven_day?: { utilization?: number; resets_at?: string } | null;
  seven_day_opus?: { utilization?: number; resets_at?: string } | null;
  seven_day_sonnet?: { utilization?: number; resets_at?: string } | null;
  extra_usage?: { is_enabled?: boolean; monthly_limit?: number; current_usage?: number } | null;
  [k: string]: unknown;
};

type ClaudeProfile = {
  account?: {
    uuid?: string;
    email?: string;
    display_name?: string;
    full_name?: string;
    has_claude_pro?: boolean;
    has_claude_max?: boolean;
  };
  organization?: {
    uuid?: string;
    name?: string;
    organization_type?: string;
    billing_type?: string;
  };
};

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

let usageCache: CacheEntry<ClaudeUsage> | null = null;
let profileCache: CacheEntry<ClaudeProfile> | null = null;

async function readAccessToken(): Promise<string | null> {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const raw = await readFile(credPath, 'utf8');
    const parsed = readObjectRecord(JSON.parse(raw));
    const oauth = readObjectRecord(parsed?.claudeAiOauth);
    return readOptionalString(oauth?.accessToken) ?? null;
  } catch {
    return null;
  }
}

async function fetchOAuthJson<T>(endpoint: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${OAUTH_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': OAUTH_BETA_HEADER,
        'User-Agent': 'cloudcli/1.32',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type NormalizedRateLimit = {
  fiveHour: { utilization: number; resetsAt: number } | null;
  weeklyOpus: { utilization: number; resetsAt: number } | null;
  weeklySonnet: { utilization: number; resetsAt: number } | null;
  weeklyAll: { utilization: number; resetsAt: number } | null;
  extraUsage: {
    enabled: boolean;
    monthlyLimit: number | null;
    currentUsage: number | null;
  } | null;
  fetchedAt: number;
};

function normalize(usage: ClaudeUsage, fetchedAt: number): NormalizedRateLimit {
  const conv = (slot?: { utilization?: number; resets_at?: string } | null) => {
    if (!slot || typeof slot.utilization !== 'number') return null;
    const resets = slot.resets_at ? Date.parse(slot.resets_at) : NaN;
    return {
      utilization: slot.utilization,
      resetsAt: Number.isFinite(resets) ? resets : 0,
    };
  };

  const extra = usage.extra_usage;
  return {
    fiveHour: conv(usage.five_hour),
    weeklyOpus: conv(usage.seven_day_opus),
    weeklySonnet: conv(usage.seven_day_sonnet),
    weeklyAll: conv(usage.seven_day),
    extraUsage: extra && typeof extra === 'object'
      ? {
          enabled: Boolean(extra.is_enabled),
          monthlyLimit: typeof extra.monthly_limit === 'number' ? extra.monthly_limit : null,
          currentUsage: typeof extra.current_usage === 'number' ? extra.current_usage : null,
        }
      : null,
    fetchedAt,
  };
}

export const claudeOAuthApiService = {
  async getUsage(): Promise<NormalizedRateLimit | null> {
    if (usageCache && Date.now() - usageCache.fetchedAt < CACHE_TTL_MS) {
      return normalize(usageCache.data, usageCache.fetchedAt);
    }
    const token = await readAccessToken();
    if (!token) return null;
    const data = await fetchOAuthJson<ClaudeUsage>('/api/oauth/usage', token);
    if (!data) return null;
    const fetchedAt = Date.now();
    usageCache = { data, fetchedAt };
    return normalize(data, fetchedAt);
  },

  async getProfile(): Promise<ClaudeProfile | null> {
    if (profileCache && Date.now() - profileCache.fetchedAt < CACHE_TTL_MS * 20) {
      return profileCache.data;
    }
    const token = await readAccessToken();
    if (!token) return null;
    const data = await fetchOAuthJson<ClaudeProfile>('/api/oauth/profile', token);
    if (!data) return null;
    profileCache = { data, fetchedAt: Date.now() };
    return data;
  },

  // 切帳號時呼叫一次，讓 panel 立刻拿到新帳號的資料
  invalidate(): void {
    usageCache = null;
    profileCache = null;
  },
};
