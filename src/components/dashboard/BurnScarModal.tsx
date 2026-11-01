import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Satellite, FileDown, Loader2, RefreshCw, CloudOff, ShieldCheck, ShieldX, Clock } from "lucide-react";
import { toast } from "sonner";
import type { LiveFire } from "./MapView";
import { verifyBurnScar } from "@/lib/burnScar.functions";
import {
  AUDIT_RADIUS_M,
  compensationSlabInr,
  severityLabel,
  THUMB_HALF_WIDTH_M,
  VERDICT_LABEL,
  type BurnVerdict,
} from "@/lib/burnScar";
import type { OfficerAssignment } from "@/lib/officerMatch";

type Props = {
  fire: LiveFire | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  placeLabel?: string | null;
  assignment?: OfficerAssignment | null;
};

type Verification = Awaited<ReturnType<typeof verifyBurnScar>>;
type OkVerification = Extract<Verification, { ok: true }>;

const VERDICT_TONE: Record<BurnVerdict, { cls: string; Icon: typeof ShieldCheck }> = {
  confirmed: { cls: "border-[oklch(0.65_0.24_25/0.6)] bg-[oklch(0.65_0.24_25/0.15)] text-[oklch(0.80_0.20_25)]", Icon: ShieldCheck },
  not_detected: { cls: "border-[oklch(0.78_0.18_155/0.5)] bg-[oklch(0.78_0.18_155/0.12)] text-[oklch(0.85_0.18_155)]", Icon: ShieldX },
  awaiting_imagery: { cls: "border-[oklch(0.82_0.17_80/0.5)] bg-[oklch(0.82_0.17_80/0.12)] text-[oklch(0.88_0.17_80)]", Icon: Clock },
  insufficient_clear: { cls: "border-[oklch(0.82_0.17_80/0.5)] bg-[oklch(0.82_0.17_80/0.12)] text-[oklch(0.88_0.17_80)]", Icon: CloudOff },
};

const VERDICT_NOTE: Record<BurnVerdict, string> = {
  confirmed: "Charred cropland detected around the hotspot after the fire.",
  not_detected: "Clear post-fire imagery shows no charred cropland around the hotspot.",
  awaiting_imagery:
    "No clear Sentinel-2 pass since detection yet (revisit ≈ 5 days). The hourly job re-checks dispatched alerts automatically.",
  insufficient_clear: "Cloud or haze covers too much of the area to judge. Re-run after the next clear pass.",
};

export function BurnScarModal({ fire, open, onOpenChange, placeLabel, assignment }: Props) {
  const verify = useServerFn(verifyBurnScar);
  const [state, setState] = useState<{ loading: boolean; data: Verification | null }>({ loading: false, data: null });
  const [run, setRun] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!open || !fire) return;
    let cancelled = false;
    setState({ loading: true, data: null });
    verify({
      data: { lat: fire.lat, lng: fire.lng, acqDate: fire.acqDate, acqTime: fire.acqTime, satellite: fire.satellite },
    })
      .then((d) => !cancelled && setState({ loading: false, data: d }))
      .catch((err: Error) =>
        !cancelled && setState({ loading: false, data: { ok: false, fireKey: "", error: err.message } }),
      );
    return () => {
      cancelled = true;
    };
  }, [open, fire, run, verify]);

  if (!fire) return null;
  const v = state.data?.ok ? state.data : null;

  const handlePdf = async (d: OkVerification) => {
    setPdfBusy(true);
    try {
      const { downloadBurnScarReport } = await import("@/lib/burnScarReport");
      await downloadBurnScarReport({
        fireKey: d.fireKey,
        recordId: d.recordId,
        recordedAt: d.recordedAt,
        verifiedBy: d.verifiedBy,
        fire,
        placeLabel,
        assignment,
        method: d.method,
        result: d.result,
      });
    } catch (err) {
      toast.error("Could not build the PDF report", { description: (err as Error).message });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-border bg-[oklch(0.19_0.02_252)] text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold tracking-wide">
            <Satellite className="h-4 w-4 text-[oklch(0.78_0.10_220)]" />
            Burn Scar Evidence · Sentinel-2 ΔNBR
          </DialogTitle>
          <DialogDescription className="text-mono text-[11px] text-muted-foreground">
            {fire.lat.toFixed(5)}, {fire.lng.toFixed(5)} · Detected {fire.acqDate} {fire.acqTime} UTC · {fire.satellite} ·
            FRP {fire.frp.toFixed(1)} MW
            {placeLabel ? ` · ${placeLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        {state.loading && (
          <div className="flex h-[360px] flex-col items-center justify-center gap-2 rounded-md border border-border bg-[oklch(0.215_0.022_252)] text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Pulling Sentinel-2 scenes and computing ΔNBR…
            <span className="text-mono text-[10px]">usually 5–15 seconds</span>
          </div>
        )}

        {!state.loading && state.data && !state.data.ok && (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-md border border-[oklch(0.65_0.24_25/0.5)] bg-[oklch(0.65_0.24_25/0.08)] text-sm">
            <span>{state.data.error}</span>
            <button
              onClick={() => setRun((n) => n + 1)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        )}

        {v && <Evidence v={v} />}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          >
            Close
          </button>
          {v && (
            <button
              onClick={() => setRun((n) => n + 1)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-run
            </button>
          )}
          <button
            onClick={() => v && handlePdf(v)}
            disabled={!v || pdfBusy}
            className="flex items-center gap-1.5 rounded-md bg-[oklch(0.78_0.10_220)] px-3 py-1.5 text-xs font-bold text-[oklch(0.15_0.02_252)] hover:opacity-90 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Download PDF Report
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Evidence({ v }: { v: OkVerification }) {
  const r = v.result;
  const tone = VERDICT_TONE[r.verdict];
  const t = r.thumbnails;
  const confirmed = r.verdict === "confirmed";
  const measured = r.verdict === "confirmed" || r.verdict === "not_detected";

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 rounded-md border px-3 py-2 ${tone.cls}`}>
        <tone.Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-wide">{VERDICT_LABEL[r.verdict]}</div>
          <div className="text-[11px] text-foreground/80">{VERDICT_NOTE[r.verdict]}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-[oklch(0.215_0.022_252)] p-3 sm:grid-cols-4">
        <Metric label="Scorched area" value={measured ? r.burnedAcres.toFixed(2) : "—"} unit="acres" sub={measured ? `${r.burnedHa.toFixed(2)} ha of ${r.auditedHa.toFixed(1)} ha audited` : `${AUDIT_RADIUS_M} m audit radius`} />
        <Metric label="Mean ΔNBR (burned)" value={r.meanDnbrBurned?.toFixed(3) ?? "—"} sub={severityLabel(r.meanDnbrBurned)} />
        <Metric label="Cloud-free cover" value={measured || r.verdict === "insufficient_clear" ? `${Math.round(r.clearFraction * 100)}` : "—"} unit="%" sub={`${r.preScenes.length} pre · ${r.postScenes.length} post scenes`} />
        <Metric
          label="Indicative compensation"
          value={confirmed ? `₹${compensationSlabInr(r.burnedAcres).toLocaleString("en-IN")}` : "—"}
          sub={confirmed ? "per incident, to be confirmed" : "only if scar confirmed"}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Thumb src={t?.preTrue} label="Pre-fire · true colour" sub={`median ${r.preWindow[0]} → ${r.preWindow[1]}`} />
        <Thumb src={t?.postTrue} label="Post-fire · true colour" sub={r.postScenes[0] ? `first pass ${r.postScenes[0].date}` : "no pass yet"} />
        <Thumb src={t?.postFalse} label="False colour SWIR/NIR/Red" sub="char = dark maroon" />
        <Thumb src={t?.dnbr} label="ΔNBR burn index" sub="green unburned → red severe" legend />
      </div>

      <div className="text-mono text-[10px] leading-relaxed text-muted-foreground">
        White circle = {AUDIT_RADIUS_M} m audit radius around the thermal hotspot. Burned pixel = ΔNBR ≥ 0.10, post-fire
        NBR &lt; 0 (charred) and ESA WorldCover cropland. Scenes:{" "}
        {[...r.preScenes, ...r.postScenes].map((s) => s.date).join(", ") || "none"}.
        {v.recordId ? ` Evidence record ${v.recordId.slice(0, 8)} saved.` : ""}
      </div>
    </div>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <div className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground">
        {value} {unit && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="text-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Thumb({ src, label, sub, legend }: { src?: string | null; label: string; sub: string; legend?: boolean }) {
  const ring = `${(AUDIT_RADIUS_M / THUMB_HALF_WIDTH_M) * 100}%`;
  return (
    <figure className="overflow-hidden rounded-md border border-border bg-[oklch(0.215_0.022_252)]">
      <div className="relative aspect-square w-full">
        {src ? (
          <>
            <img src={src} alt={label} className="absolute inset-0 h-full w-full object-cover" />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/90"
              style={{ width: ring, height: ring }}
            />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[oklch(0.65_0.24_25)]" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center text-[11px] text-muted-foreground">
            No clear scene yet
          </div>
        )}
      </div>
      <figcaption className="px-2 py-1.5">
        <div className="text-[11px] font-semibold text-foreground">{label}</div>
        <div className="text-mono text-[9px] text-muted-foreground">{sub}</div>
        {legend && (
          <div className="mt-1 h-1.5 w-full rounded-full bg-[linear-gradient(90deg,#1a9850,#91cf60,#d9ef8b,#fee08b,#fc8d59,#d73027)]" />
        )}
      </figcaption>
    </figure>
  );
}
