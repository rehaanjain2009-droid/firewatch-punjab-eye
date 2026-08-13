import { Suspense, lazy } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Satellite, Flame, Paperclip, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LiveFire } from "./MapView";

const BurnScarMiniMap = lazy(() => import("./BurnScarMiniMap").then((m) => ({ default: m.BurnScarMiniMap })));

type Props = {
  fire: LiveFire | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function BurnScarModal({ fire, open, onOpenChange }: Props) {
  if (!fire) return null;

  const hectares = Math.max(0.3, fire.frp * 0.5).toFixed(1);
  const confidence = Math.min(98, 80 + Math.round(fire.confidence / 8));

  const handleAttach = () => {
    toast.success("Optical evidence attached to case file", {
      description: `${fire.block} · ${fire.lat.toFixed(4)}, ${fire.lng.toFixed(4)}`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-[oklch(0.19_0.02_252)] text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold tracking-wide">
            <Satellite className="h-4 w-4 text-[oklch(0.78_0.10_220)]" />
            Optical Verification: Sentinel-2 NIR
          </DialogTitle>
          <DialogDescription className="text-mono text-[11px] text-muted-foreground">
            {fire.lat.toFixed(5)}, {fire.lng.toFixed(5)} · Acquired {fire.acqDate} {fire.acqTime} UTC · {fire.satellite}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border overflow-hidden">
          <Suspense
            fallback={(
              <div className="h-[280px] w-full flex items-center justify-center bg-[oklch(0.215_0.022_252)] text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading satellite view…
              </div>
            )}
          >
            <BurnScarMiniMap fire={fire} />
          </Suspense>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-[oklch(0.215_0.022_252)] p-3">
          <div>
            <div className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">Est. Burn Area</div>
            <div className="text-lg font-bold text-foreground">{hectares} <span className="text-xs font-normal text-muted-foreground">ha</span></div>
          </div>
          <div>
            <div className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">FRP Intensity</div>
            <div className="text-lg font-bold text-[oklch(0.88_0.17_80)]">{fire.frp.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">MW</span></div>
          </div>
          <div>
            <div className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">Confidence</div>
            <div className="text-lg font-bold text-[oklch(0.85_0.18_155)]">High ({confidence}%)</div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleAttach}
            className="flex items-center gap-1.5 rounded-md bg-[oklch(0.78_0.10_220)] px-3 py-1.5 text-xs font-bold text-[oklch(0.15_0.02_252)] hover:opacity-90"
          >
            <Paperclip className="h-3.5 w-3.5" /> Attach Evidence to Dispatch
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
