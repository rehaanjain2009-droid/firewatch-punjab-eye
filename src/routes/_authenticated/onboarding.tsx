import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, ExternalLink, ShieldAlert } from "lucide-react";
import { getMyProfile, upsertTelegramHandle } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  loader: () => getMyProfile(),
  component: Onboarding,
});

const INVITE_URL = import.meta.env.VITE_TELEGRAM_INVITE_URL as string | undefined;

function Onboarding() {
  const profile = Route.useLoaderData();
  const navigate = useNavigate();
  const save = useServerFn(upsertTelegramHandle);
  const [handle, setHandle] = useState(profile?.telegram_handle ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await save({ data: { handle } });
      navigate({ to: "/" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="panel w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 border border-primary/40 glow-emerald">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide">OPERATOR ONBOARDING</h1>
            <p className="text-[11px] text-muted-foreground text-mono">Link your Telegram and join the dispatch group</p>
          </div>
        </div>

        <form onSubmit={onSave} className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Telegram Handle</label>
            <input
              type="text"
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@your_handle"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">5–32 characters, letters/digits/underscores. The leading @ is optional.</p>
          </div>
          {error && <div className="text-mono text-[11px] text-[oklch(0.78_0.22_25)]">⚠ {error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Save & Continue
          </button>
        </form>

        <div className="rounded-md border border-border bg-accent/30 p-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dispatch Group</div>
          {INVITE_URL ? (
            <a
              href={INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Join Telegram Dispatch Group
            </a>
          ) : (
            <div className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-mono text-[11px] text-muted-foreground">
              Invite link not configured yet. Ask your administrator to set <span className="text-foreground">VITE_TELEGRAM_INVITE_URL</span>.
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Joining this group is how you receive live dispatch alerts.</p>
        </div>
      </div>
    </div>
  );
}
