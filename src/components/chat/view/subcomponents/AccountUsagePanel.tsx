import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleUser, X, ExternalLink, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../../../utils/api';

type AuthStatus = {
  installed: boolean;
  provider: string;
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

type RateSlot = { utilization: number; resetsAt: number };
type UsagePayload = {
  fiveHour: RateSlot | null;
  weeklyOpus: RateSlot | null;
  weeklySonnet: RateSlot | null;
  weeklyAll: RateSlot | null;
  extraUsage: {
    enabled: boolean;
    monthlyLimit: number | null;
    currentUsage: number | null;
  } | null;
  fetchedAt: number;
} | null;

// 帳號槽由 UsageMonitorForClaude 的 accounts 目錄提供，本專案只讀不寫
type SavedAccount = {
  label: string;
  email: string | null;
  isActive: boolean;
  fiveHour: RateSlot | null;
  weeklyAll: RateSlot | null;
  // 用量來自排程器寫的快照而非即時 API，所以要標出它多舊
  usageFetchedAt: number | null;
};

function formatAge(fetchedAt: number | null): string {
  if (!fetchedAt) return '';
  const min = Math.floor((Date.now() - fetchedAt) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatResetTime(resetsAt?: number): string {
  if (!resetsAt) return '';
  const ms = resetsAt - Date.now();
  if (ms <= 0) return 'now';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

function describeMethod(method: string | null): string {
  if (!method) return '—';
  if (method === 'api_key') return 'API Key';
  if (method === 'credentials_file') return 'Claude AI';
  return method;
}

export default function AccountUsagePanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('chat');
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [switchAvailable, setSwitchAvailable] = useState(false);
  const [accountActionLabel, setAccountActionLabel] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setAccountError(null);
    try {
      const res = await authenticatedFetch('/api/providers/claude/accounts');
      if (res.ok) {
        const json = await res.json();
        setAccounts(json?.data?.accounts ?? []);
        setSwitchAvailable(Boolean(json?.data?.available));
      }
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [authRes, usageRes] = await Promise.all([
        authenticatedFetch('/api/providers/claude/auth/status'),
        authenticatedFetch('/api/providers/claude/usage'),
      ]);

      if (authRes.ok) {
        const authJson = await authRes.json();
        setAuth(authJson?.data ?? null);
      }
      if (usageRes.ok) {
        const usageJson = await usageRes.json();
        setUsage(usageJson?.data ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    await loadAccounts();
  }, [loadAccounts]);

  const handleActivate = useCallback(async (label: string) => {
    setAccountError(null);
    setAccountActionLabel(label);
    try {
      const res = await authenticatedFetch(`/api/providers/claude/accounts/${encodeURIComponent(label)}/activate`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || json?.message || 'Activate failed');
      // 切完重新讀 auth status + 帳號列表 (isActive 會跟著變)
      await load();
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccountActionLabel(null);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 直接打 Anthropic /api/oauth/usage 拿到的真實值
  const fiveHr = usage?.fiveHour ?? null;
  const weekly = usage?.weeklyAll ?? null;
  const weeklyOpus = usage?.weeklyOpus ?? null;
  const weeklySonnet = usage?.weeklySonnet ?? null;
  const extraUsage = usage?.extraUsage ?? null;
  const hasAnyUsage = Boolean(fiveHr || weekly || weeklyOpus || weeklySonnet);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-base font-semibold">
            {t('accountUsage.title', { defaultValue: 'Account & Usage' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Account 區塊 */}
        <div className="px-5 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('accountUsage.account', { defaultValue: 'Account' })}
          </div>
          {loading && !auth ? (
            <div className="text-sm text-muted-foreground">{t('common.loading', { defaultValue: 'Loading...' })}</div>
          ) : auth?.authenticated ? (
            <div className="space-y-2 text-sm">
              <Row label={t('accountUsage.authMethod', { defaultValue: 'Auth method' })} value={describeMethod(auth.method)} />
              <Row label={t('accountUsage.email', { defaultValue: 'Email' })} value={auth.email || '—'} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {auth?.error || t('accountUsage.notAuthed', { defaultValue: 'Not authenticated' })}
            </div>
          )}
        </div>

        {/* Usage 區塊 */}
        <div className="border-t border-border/60 px-5 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('accountUsage.usage', { defaultValue: 'Usage' })}
          </div>

          {!hasAnyUsage ? (
            <div className="text-sm text-muted-foreground">
              {t('accountUsage.noUsageYet', {
                defaultValue: 'No usage data available.',
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <UsageBar
                label={t('accountUsage.fiveHr', { defaultValue: 'Session (5hr)' })}
                percent={fiveHr ? Math.round(fiveHr.utilization) : null}
                resetIn={fiveHr ? formatResetTime(fiveHr.resetsAt) : ''}
              />
              <UsageBar
                label={t('accountUsage.weekly', { defaultValue: 'Weekly (7 day)' })}
                percent={weekly ? Math.round(weekly.utilization) : null}
                resetIn={weekly ? formatResetTime(weekly.resetsAt) : ''}
              />
              {weeklyOpus && (
                <UsageBar
                  label={t('accountUsage.weeklyOpus', { defaultValue: 'Weekly Opus' })}
                  percent={Math.round(weeklyOpus.utilization)}
                  resetIn={formatResetTime(weeklyOpus.resetsAt)}
                />
              )}
              {weeklySonnet && (
                <UsageBar
                  label={t('accountUsage.weeklySonnet', { defaultValue: 'Weekly Sonnet' })}
                  percent={Math.round(weeklySonnet.utilization)}
                  resetIn={formatResetTime(weeklySonnet.resetsAt)}
                />
              )}
              {extraUsage?.enabled && (
                <div className="text-[11px] text-orange-500">
                  {t('accountUsage.overage', { defaultValue: 'Overage credit enabled' })}
                  {extraUsage.monthlyLimit !== null && extraUsage.currentUsage !== null && (
                    <span className="ml-1 text-muted-foreground">
                      (${extraUsage.currentUsage.toFixed(2)} / ${extraUsage.monthlyLimit.toFixed(2)})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 切帳號區塊。整套搬移邏輯在 UsageMonitorForClaude 的 switch-account.ps1，
            沒配置那個工具時整段隱藏（本專案不提供自己的憑證管理）。 */}
        {switchAvailable && (
        <div className="border-t border-border/60 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('accountUsage.savedAccounts', { defaultValue: 'Accounts' })}
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('accountUsage.noSavedAccounts', {
                defaultValue: 'No account slots found. Add one on the PC: set CLAUDE_CONFIG_DIR to a new folder under the accounts directory, run claude, and log in.',
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((acc) => {
                const busy = accountActionLabel === acc.label;
                return (
                  <div
                    key={acc.label}
                    className={`rounded-md border px-2.5 py-1.5 ${
                      acc.isActive ? 'border-primary/40 bg-primary/5' : 'border-border/40'
                    }`}
                  >
                    {/* 第一行：標題列 + 操作按鈕 */}
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          {acc.isActive && <Check className="h-3 w-3 shrink-0 text-primary" />}
                          <span className="truncate font-medium">{acc.label}</span>
                          {acc.email && (
                            <span className="truncate text-[11px] text-muted-foreground">— {acc.email}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy || acc.isActive}
                        onClick={() => handleActivate(acc.label)}
                        className="shrink-0 rounded border border-border/60 px-2 py-0.5 text-[11px] hover:bg-accent disabled:opacity-40"
                        title={acc.isActive
                          ? t('accountUsage.alreadyActive', { defaultValue: 'Already active' })
                          : t('accountUsage.switchTo', { defaultValue: 'Switch to this account' })}
                      >
                        {acc.isActive
                          ? t('accountUsage.active', { defaultValue: 'Active' })
                          : t('accountUsage.use', { defaultValue: 'Use' })}
                      </button>
                    </div>

                    {/* 第二行：mini 用量條 (5hr / 7day)。資料是排程器的快照，還沒跑過就整段隱藏 */}
                    {(acc.fiveHour || acc.weeklyAll) && (
                      <>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                          <MiniBar
                            label={t('accountUsage.fiveHrShort', { defaultValue: '5h' })}
                            slot={acc.fiveHour}
                          />
                          <MiniBar
                            label={t('accountUsage.weeklyShort', { defaultValue: '7d' })}
                            slot={acc.weeklyAll}
                          />
                        </div>
                        {acc.usageFetchedAt && (
                          <div className="mt-1 text-right text-[10px] text-muted-foreground">
                            {formatAge(acc.usageFetchedAt)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {accountError && (
            <div className="mt-2 text-[11px] text-destructive">{accountError}</div>
          )}

          <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {t('accountUsage.switchHint', {
              defaultValue: 'Switching moves the credential file, handled entirely by switch-account.ps1. Affects this machine globally — CloudCLI, VSCode and the local CLI all share one credential file, so reload the VSCode window afterwards.',
            })}
          </div>
        </div>
        )}

        {/* Footer */}
        <div className="border-t border-border/60 bg-muted/30 px-5 py-3">
          <a
            href="https://claude.ai/settings/billing"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            {t('accountUsage.manageOnClaudeAi', { defaultValue: 'Manage usage on claude.ai' })}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {error && (
          <div className="border-t border-border/60 px-5 py-2 text-xs text-destructive">{error}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground">{value}</span>
    </div>
  );
}

// 每個 saved account 一行下方的雙欄迷你 progress + 重置倒數
function MiniBar({ label, slot }: { label: string; slot: RateSlot | null }) {
  if (!slot) {
    return (
      <div className="text-[10px] text-muted-foreground/60">
        {label}: —
      </div>
    );
  }
  const pct = Math.round(slot.utilization);
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-500' : 'bg-primary/70';
  const ms = slot.resetsAt - Date.now();
  let reset = '';
  if (ms > 0) {
    const min = Math.floor(ms / 60000);
    if (min < 60) reset = `${min}m`;
    else if (min < 60 * 24) reset = `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`;
    else reset = `${Math.floor(min / (60 * 24))}d`;
  }
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">
          {label} {pct}%
        </span>
        {reset && (
          <span className="text-muted-foreground/70">↻{reset}</span>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function UsageBar({
  label,
  percent,
  resetIn,
}: {
  label: string;
  percent: number | null;
  resetIn?: string;
}) {
  const pct = percent ?? 0;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-500' : 'bg-primary';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{percent === null ? '—' : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      {resetIn && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Resets in {resetIn}
        </div>
      )}
    </div>
  );
}

// 觸發按鈕（給 ChatComposer 用）
export function AccountUsageButton() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation('chat');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={t('accountUsage.title', { defaultValue: 'Account & Usage' })}
        aria-label="Account & Usage"
      >
        <CircleUser className="h-3.5 w-3.5" />
      </button>
      {open && <AccountUsagePanel onClose={() => setOpen(false)} />}
    </>
  );
}
