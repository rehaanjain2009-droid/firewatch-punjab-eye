import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Satellite, Flame, Paperclip, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LiveFire } from "./MapView";

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Pre-Fire */}
          <div className="relative overflow-hidden rounded-md border border-border">
            <div
              className="aspect-square w-full"
              style={{
                background:
                  "repeating-linear-gradient(45deg, oklch(0.42 0.13 145) 0 14px, oklch(0.36 0.12 148) 14px 28px), radial-gradient(circle at 30% 40%, oklch(0.5 0.15 140) 0 6%, transparent 8%), radial-gradient(circle at 70% 65%, oklch(0.48 0.14 142) 0 5%, transparent 8%)",
                backgroundBlendMode: "overlay",
              }}
            />
            <div className="absolute inset-0 bg-black/25 flex flex-col justify-between p-2.5">
              <span className="text-mono text-[10px] font-bold tracking-wider text-white/90 self-start rounded bg-black/50 px-1.5 py-0.5 border border-white/10">
                PRE-FIRE · NDVI HIGH
              </span>
              <div className="flex items-center gap-1.5 text-mono text-[10px] text-white/70">
                <Loader2 className="h-3 w-3 animate-spin" /> Fetching optical data…
              </div>
            </div>
          </div>

          {/* Post-Fire */}
          <div className="relative overflow-hidden rounded-md border border-[oklch(0.65_0.24_25/0.5)]">
            <div
              className="aspect-square w-full"
              style={{
                background:
                  "repeating-linear-gradient(45deg, oklch(0.22 0.04 40) 0 14px, oklch(0.18 0.03 35) 14px 28px), radial-gradient(circle at 45% 50%, oklch(0.12 0.02 30) 0 22%, transparent 30%), radial-gradient(circle at 60% 55%, oklch(0.08 0.01 25) 0 12%, transparent 22%)",
                backgroundBlendMode: "multiply",
              }}
            />
            <div className="absolute inset-0 flex flex-col justify-between p-2.5">
              <span className="text-mono text-[10px] font-bold tracking-wider text-white self-start rounded bg-[oklch(0.65_0.24_25)] px-1.5 py-0.5">
                POST-FIRE · BURN SCAR
              </span>
              <div className="flex items-center gap-1.5 text-mono text-[10px] text-[oklch(0.88_0.17_80)]">
                <Flame className="h-3 w-3" /> NBR delta detected
              </div>
            </div>
          </div>
        </div>

        {/* Intelligence Overlay */}
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
