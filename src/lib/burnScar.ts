/**
 * Browser-safe burn scar rules shared by the Earth Engine analysis, the
 * evidence card and the PDF report, so every surface reports the same verdict.
 */

/** ΔNBR (pre − post) at or above this marks a 10 m pixel as burned (USGS "low severity" floor). */
export const DNBR_BURN_THRESHOLD = 0.1;
/** Post-fire NBR must fall below this (charred surface) — rejects harvested-but-unburned stubble. */
export const POST_NBR_CHAR_MAX = 0;
/** Radius around the thermal hotspot that is audited (VIIRS 375 m pixel + geolocation error). */
export const AUDIT_RADIUS_M = 500;
/** Half-width of the square evidence thumbnails around the hotspot. */
export const THUMB_HALF_WIDTH_M = 1200;
/** Pre-fire window (days before detection) and post-fire window (days after). */
export const PRE_WINDOW_DAYS = 20;
export const POST_WINDOW_DAYS = 30;
/** Minimum scorched area to call the scar confirmed (20 Sentinel-2 pixels). */
export const MIN_CONFIRMED_HA = 0.2;
/** Minimum share of the audit circle that must be cloud-free in both images. */
export const MIN_CLEAR_FRACTION = 0.3;

export const HA_TO_ACRES = 2.47105;

export type BurnVerdict = "confirmed" | "not_detected" | "awaiting_imagery" | "insufficient_clear";

export function hectaresToAcres(ha: number): number {
  return Math.round(ha * HA_TO_ACRES * 100) / 100;
}

export function classifyVerdict(input: {
  preScenes: number;
  postScenes: number;
  clearFraction: number;
  burnedHa: number;
}): BurnVerdict {
  if (input.postScenes === 0) return "awaiting_imagery";
  if (input.preScenes === 0 || input.clearFraction < MIN_CLEAR_FRACTION) return "insufficient_clear";
  return input.burnedHa >= MIN_CONFIRMED_HA ? "confirmed" : "not_detected";
}

/** USGS ΔNBR burn severity classes. */
export function severityLabel(dnbr: number | null): string {
  if (dnbr == null || !Number.isFinite(dnbr)) return "—";
  if (dnbr < 0.1) return "Unburned";
  if (dnbr < 0.27) return "Low severity";
  if (dnbr < 0.44) return "Moderate-low severity";
  if (dnbr < 0.66) return "Moderate-high severity";
  return "High severity";
}

export const VERDICT_LABEL: Record<BurnVerdict, string> = {
  confirmed: "BURN SCAR CONFIRMED",
  not_detected: "NO BURN SCAR DETECTED",
  awaiting_imagery: "AWAITING POST-FIRE PASS",
  insufficient_clear: "CLOUD / HAZE — INCONCLUSIVE",
};

/**
 * Indicative environmental compensation slab per incident for stubble burning
 * (CAQM amendment rules, Nov 2024). Shown as guidance only — the issuing
 * authority confirms the final amount.
 */
export function compensationSlabInr(acres: number): number {
  if (acres < 2) return 5000;
  if (acres <= 5) return 10000;
  return 30000;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
