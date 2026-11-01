import {
  AUDIT_RADIUS_M,
  compensationSlabInr,
  severityLabel,
  THUMB_HALF_WIDTH_M,
  VERDICT_LABEL,
  type BurnVerdict,
} from "./burnScar";
import type { OfficerAssignment } from "./officerMatch";

export type ReportInput = {
  fireKey: string;
  recordId: string | null;
  recordedAt: string;
  verifiedBy: string | null;
  fire: {
    lat: number;
    lng: number;
    frp: number;
    confidence: number;
    acqDate: string;
    acqTime: string;
    satellite: string;
    daynight?: string;
  };
  placeLabel?: string | null;
  assignment?: OfficerAssignment | null;
  method: Record<string, string | number>;
  result: {
    verdict: BurnVerdict;
    burnedHa: number;
    burnedAcres: number;
    auditedHa: number;
    clearFraction: number;
    meanDnbrBurned: number | null;
    meanDnbrAll: number | null;
    meanPreNbr: number | null;
    meanPostNbr: number | null;
    preScenes: { id: string; date: string }[];
    postScenes: { id: string; date: string }[];
    preWindow: [string, string];
    postWindow: [string, string];
    thumbnails: { preTrue: string | null; postTrue: string | null; postFalse: string | null; dnbr: string | null } | null;
  };
};

const fmt = (v: number | null, d = 3) => (v == null ? "—" : v.toFixed(d));

/** Build the PPCB compliance report PDF in the browser and trigger a download. */
export async function downloadBurnScarReport(r: ReportInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  let y = 14;

  const line = (label: string, value: string, x = M, w = 90) => {
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(90);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(20);
    const lines = doc.splitTextToSize(value, w - 38);
    doc.text(lines, x + 38, y);
    return lines.length;
  };
  const section = (title: string) => {
    y += 3;
    doc.setFillColor(28, 36, 52).rect(M, y - 4.2, W - 2 * M, 6, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255);
    doc.text(title, M + 2, y);
    y += 6;
  };

  // Header
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20);
  doc.text("Stubble Burning Compliance Report", M, y);
  y += 5.5;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(80);
  doc.text("Sentinel-2 optical burn scar verification (dNBR) · for PPCB environmental compensation proceedings", M, y);
  y += 4.5;
  doc.text(
    `Generated ${new Date(r.recordedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` +
      (r.verifiedBy ? ` · by ${r.verifiedBy}` : "") +
      (r.recordId ? ` · Evidence record ${r.recordId}` : ""),
    M,
    y,
  );
  y += 3;
  doc.setDrawColor(200).line(M, y, W - M, y);
  y += 4;

  // Verdict banner
  const v = r.result.verdict;
  const tone: [number, number, number] =
    v === "confirmed" ? [200, 40, 40] : v === "not_detected" ? [30, 140, 80] : [190, 130, 20];
  doc.setFillColor(...tone).rect(M, y, W - 2 * M, 11, "F");
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(255);
  doc.text(VERDICT_LABEL[v], M + 3, y + 7.3);
  if (v === "confirmed") {
    doc.text(`${r.result.burnedAcres.toFixed(2)} acres  (${r.result.burnedHa.toFixed(2)} ha) scorched`, W - M - 3, y + 7.3, {
      align: "right",
    });
  }
  y += 16;

  section("1. INCIDENT");
  const f = r.fire;
  line("Incident key", r.fireKey, M, W - 2 * M); y += 5;
  line("Coordinates", `${f.lat.toFixed(5)} N, ${f.lng.toFixed(5)} E`); 
  line("Detected", `${f.acqDate} ${f.acqTime.padStart(4, "0")} UTC${f.daynight === "N" ? " (night)" : ""}`, 105); y += 5;
  line("Sensor", f.satellite);
  line("FRP / confidence", `${f.frp.toFixed(1)} MW · ${f.confidence}%`, 105); y += 5;
  const nLoc = line("Location", r.placeLabel || "—", M, W - 2 * M); y += 5 * nLoc;
  line("Google Maps", `https://www.google.com/maps?q=${f.lat},${f.lng}`, M, W - 2 * M); y += 5;
  if (r.assignment) {
    const a = r.assignment;
    line("Jurisdiction", `${a.village} · ${a.block} block${a.thana ? ` · PS ${a.thana}` : ""} (${a.distanceKm} km)`, M, W - 2 * M);
    y += 5;
    for (const o of a.officers) {
      line(o.role, `${o.name}${o.contact ? ` · ${o.contact}` : ""}`, M, W - 2 * M);
      y += 5;
    }
  }

  section("2. SENTINEL-2 dNBR ANALYSIS");
  const res = r.result;
  line("Scorched area", `${res.burnedHa.toFixed(2)} ha = ${res.burnedAcres.toFixed(2)} acres`);
  line("Audited area", `${res.auditedHa.toFixed(2)} ha (${AUDIT_RADIUS_M} m radius)`, 105); y += 5;
  line("Mean dNBR (burned)", `${fmt(res.meanDnbrBurned)} · ${severityLabel(res.meanDnbrBurned)}`);
  line("Cloud-free cover", `${Math.round(res.clearFraction * 100)}%`, 105); y += 5;
  line("NBR pre / post", `${fmt(res.meanPreNbr)} / ${fmt(res.meanPostNbr)} (audit mean)`);
  line("Mean dNBR (all)", fmt(res.meanDnbrAll), 105); y += 5;
  const sceneTxt = (s: { id: string; date: string }[]) => (s.length ? s.map((x) => `${x.date} ${x.id}`).join("; ") : "none");
  let n = line("Pre-fire scenes", `${res.preWindow[0]} to ${res.preWindow[1]}: ${sceneTxt(res.preScenes)}`, M, W - 2 * M);
  y += 4.2 * n + 1;
  n = line("Post-fire scenes", `${res.postWindow[0]} to ${res.postWindow[1]}: ${sceneTxt(res.postScenes)}`, M, W - 2 * M);
  y += 4.2 * n + 1;
  for (const [k, val] of Object.entries(r.method)) {
    n = line(k.replace(/([A-Z])/g, " $1"), String(val), M, W - 2 * M);
    y += 4.2 * n + 0.6;
  }

  // Imagery
  const t = res.thumbnails;
  if (t && (t.preTrue || t.postTrue || t.postFalse || t.dnbr)) {
    doc.addPage();
    y = 14;
    section("3. OPTICAL EVIDENCE (2.4 km frame, audit circle in white)");
    const size = 88;
    const gap = W - 2 * M - 2 * size;
    const cells: [string | null, string][] = [
      [t.preTrue, `Pre-fire true colour (median ${res.preWindow[0]}..${res.preWindow[1]})`],
      [t.postTrue, `Post-fire true colour (first pass ${res.postScenes[0]?.date ?? "—"})`],
      [t.postFalse, "Post-fire false colour SWIR/NIR/Red (char = dark maroon)"],
      [t.dnbr, "dNBR burn index (green = unburned → red = severe)"],
    ];
    cells.forEach(([src, caption], i) => {
      const x = M + (i % 2) * (size + gap);
      const yy = y + Math.floor(i / 2) * (size + 12);
      if (src) {
        doc.addImage(src, "JPEG", x, yy, size, size);
        const cx = x + size / 2;
        const cy = yy + size / 2;
        doc.setDrawColor(255).setLineWidth(0.5);
        doc.circle(cx, cy, (size / 2) * (AUDIT_RADIUS_M / THUMB_HALF_WIDTH_M), "S");
        doc.line(cx - 2, cy, cx + 2, cy).line(cx, cy - 2, cx, cy + 2);
        doc.setLineWidth(0.2);
      } else {
        doc.setDrawColor(180).rect(x, yy, size, size);
        doc.setFontSize(9).setTextColor(120).text("No clear scene available", x + size / 2, yy + size / 2, { align: "center" });
      }
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(60);
      doc.text(doc.splitTextToSize(caption, size), x, yy + size + 4);
    });
    y += 2 * (size + 12) + 2;
  } else {
    y += 2;
  }

  section(t ? "4. ENVIRONMENTAL COMPENSATION (INDICATIVE)" : "3. ENVIRONMENTAL COMPENSATION (INDICATIVE)");
  if (v === "confirmed") {
    line("Slab", `Rs ${compensationSlabInr(res.burnedAcres).toLocaleString("en-IN")} per incident`, M, W - 2 * M);
    y += 5;
    doc.setFontSize(7.5).setTextColor(90);
    doc.text(
      doc.splitTextToSize(
        "Indicative slab (CAQM stubble burning compensation rules, 2024 amendment): < 2 acres Rs 5,000; 2–5 acres Rs 10,000; > 5 acres Rs 30,000. Area is all charred cropland pixels inside the audit circle and may include adjacent holdings; the issuing authority must confirm the khasra and final amount on site.",
        W - 2 * M,
      ),
      M,
      y,
    );
    y += 10;
  } else {
    line("Status", "Not applicable — burn scar not confirmed by satellite", M, W - 2 * M);
    y += 7;
  }

  // Signatures
  y = Math.max(y + 10, 262);
  doc.setDrawColor(120);
  ["Verifying officer", "Patwari / Nodal officer", "PPCB authority"].forEach((label, i) => {
    const x = M + i * 62;
    doc.line(x, y, x + 52, y);
    doc.setFontSize(8).setTextColor(80).text(label, x, y + 4);
  });
  doc.setFontSize(6.5).setTextColor(130);
  doc.text(
    "Contains modified Copernicus Sentinel-2 data processed in Google Earth Engine; ESA WorldCover v200; thermal detection NASA FIRMS.",
    M,
    290,
  );

  doc.save(`burn-scar-report_${f.acqDate}_${f.lat.toFixed(4)}_${f.lng.toFixed(4)}.pdf`);
}
