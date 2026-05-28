import type { FirePoint } from "./gee.server";

export type DispatchInput = {
  block: string;
  lat: number;
  lng: number;
  confidence: number;
  frp: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
};

function fmtTime(d: string, t: string) {
  if (!t) return d;
  const padded = t.padStart(4, "0");
  return `${d} ${padded.slice(0, 2)}:${padded.slice(2)} UTC`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

export function buildMessage(f: DispatchInput): string {
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}&travelmode=driving`;
  const sev = f.confidence >= 80 ? "🚨 CRITICAL" : f.confidence >= 60 ? "⚠️ HIGH" : "📡 REVIEW";
  return [
    `<b>${sev} · STUBBLE FIRE DETECTED</b>`,
    ``,
    `📍 <b>Sector:</b> ${escapeHtml(f.block)}`,
    `🕒 <b>Detected:</b> ${escapeHtml(fmtTime(f.acqDate, f.acqTime))}`,
    `🛰 <b>Satellite:</b> ${escapeHtml(f.satellite)}`,
    `🎯 <b>AI Confidence:</b> ${f.confidence}%`,
    `🔥 <b>Fire Radiative Power:</b> ${f.frp.toFixed(1)} MW`,
    `🧭 <b>Coordinates:</b> ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`,
    ``,
    `🗺 <a href="${mapsUrl}">Open Route in Google Maps</a>`,
  ].join("\n");
}

export async function sendTelegram(
  f: DispatchInput,
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, status: 0, body: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildMessage(f),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const body = (await res.text()).slice(0, 500);
  return { ok: res.ok, status: res.status, body };
}

// Module-level dedup cache for the cron job (per-worker instance).
const dispatchedIds = new Set<string>();
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const dispatchedTs = new Map<string, number>();

function fireKey(f: FirePoint): string {
  return `${f.lat.toFixed(4)}_${f.lng.toFixed(4)}_${f.acqDate}_${f.acqTime}`;
}

export function pruneDedup() {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [k, ts] of dispatchedTs) {
    if (ts < cutoff) {
      dispatchedTs.delete(k);
      dispatchedIds.delete(k);
    }
  }
}

export function isDispatched(f: FirePoint): boolean {
  return dispatchedIds.has(fireKey(f));
}

export function markDispatched(f: FirePoint) {
  const k = fireKey(f);
  dispatchedIds.add(k);
  dispatchedTs.set(k, Date.now());
}
