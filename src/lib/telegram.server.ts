import type { OfficerAssignment } from "./officerMatch";

export type DispatchInput = {
  block: string;
  lat: number;
  lng: number;
  confidence: number;
  frp: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  assignment?: OfficerAssignment | null;
};

function fmtTime(d: string, t: string) {
  if (!t) return d;
  const padded = t.padStart(4, "0");
  return `${d} ${padded.slice(0, 2)}:${padded.slice(2)} UTC`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function officerLines(a?: OfficerAssignment | null): string[] {
  if (!a) return [``, `👮 <b>Assigned officers:</b> no village match in directory`];
  const where = `${escapeHtml(a.village)} (${escapeHtml(a.block)} block${a.thana ? `, PS ${escapeHtml(a.thana)}` : ""})`;
  const lines = [
    ``,
    `🏘 <b>Village:</b> ${where}${a.approximate ? ` · nearest listed, ${a.distanceKm} km` : ""}`,
    `👮 <b>Assigned officers:</b>`,
  ];
  for (const o of a.officers) {
    lines.push(`• ${o.role}: ${escapeHtml(o.name)}${o.contact ? ` · ☎ ${escapeHtml(o.contact)}` : ""}`);
  }
  return lines;
}

export function buildMessage(f: DispatchInput): string {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`;
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
    ...officerLines(f.assignment),
    ``,
    `🗺 <a href="${mapsUrl}">Open in Google Maps</a>`,
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
