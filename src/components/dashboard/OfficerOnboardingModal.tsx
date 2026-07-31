import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const TELEGRAM_DISPATCH_URL =
  (import.meta.env.VITE_TELEGRAM_INVITE_URL as string | undefined) ?? "https://t.me/your_dispatch_channel";

const STORAGE_KEY = "hasCompletedOnboarding";

export function OfficerOnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "true") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const enterDashboard = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* storage unavailable — proceed anyway */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="panel max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md border border-primary/40 bg-primary/15 glow-emerald">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-base font-bold tracking-wide">
            🛡️ Stubble Intelligence &amp; Automated Dispatch
          </DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Welcome to the centralized Command &amp; Control grid. Before accessing the tactical map, you must connect to
            the live dispatch network to receive automated routing coordinates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <a
            href={TELEGRAM_DISPATCH_URL}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Send className="h-4 w-4" /> 1. Join Telegram Dispatch
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
          <button
            type="button"
            onClick={enterDashboard}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-accent/40 px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-foreground hover:border-primary/40 hover:bg-accent"
          >
            2. Enter Dashboard
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
