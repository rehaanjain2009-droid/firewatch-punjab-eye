/**
 * Shared (browser + server) officer assignment rules.
 * A fire is assigned the officers of the nearest village in the Ludhiana
 * contact list that has known coordinates. Both the dashboard cards and the
 * Telegram dispatch use this, so they always name the same officers.
 */

export type OfficerDirectoryRow = {
  village: string;
  block: string;
  tehsil: string | null;
  thana: string | null;
  lat: number | null;
  lng: number | null;
  patwari_name: string | null;
  patwari_contact: string | null;
  sho_name: string | null;
  sho_contact: string | null;
  nodal_officer_name: string | null;
  nodal_officer_designation: string | null;
  nodal_officer_contact: string | null;
};

export type AssignedOfficer = {
  role: "Patwari" | "SHO" | "Nodal Officer";
  name: string;
  contact: string | null;
  designation?: string | null;
};

export type OfficerAssignment = {
  village: string;
  block: string;
  tehsil: string | null;
  thana: string | null;
  distanceKm: number;
  /** True when the nearest listed village is farther than MATCH_RADIUS_KM. */
  approximate: boolean;
  officers: AssignedOfficer[];
};

/** Beyond this distance the assignment is still made but flagged approximate. */
export const MATCH_RADIUS_KM = 5;

export const DIRECTORY_COLUMNS =
  "village, block, tehsil, thana, lat, lng, patwari_name, patwari_contact, sho_name, sho_contact, nodal_officer_name, nodal_officer_designation, nodal_officer_contact";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function officersOf(r: OfficerDirectoryRow): AssignedOfficer[] {
  const out: AssignedOfficer[] = [];
  if (r.patwari_name) out.push({ role: "Patwari", name: r.patwari_name, contact: r.patwari_contact });
  if (r.sho_name) out.push({ role: "SHO", name: r.sho_name, contact: r.sho_contact });
  if (r.nodal_officer_name)
    out.push({
      role: "Nodal Officer",
      name: r.nodal_officer_name,
      contact: r.nodal_officer_contact,
      designation: r.nodal_officer_designation,
    });
  return out;
}

export function matchOfficers(
  lat: number,
  lng: number,
  directory: OfficerDirectoryRow[],
): OfficerAssignment | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: OfficerDirectoryRow | null = null;
  let bestD = Infinity;
  for (const r of directory) {
    if (r.lat == null || r.lng == null) continue;
    const d = haversineKm(lat, lng, r.lat, r.lng);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  if (!best) return null;
  return {
    village: best.village,
    block: best.block,
    tehsil: best.tehsil,
    thana: best.thana,
    distanceKm: Math.round(bestD * 10) / 10,
    approximate: bestD > MATCH_RADIUS_KM,
    officers: officersOf(best),
  };
}

/** Stable identity for one satellite detection, shared by the UI, cron and audit log. */
export function incidentKey(f: { lat: number; lng: number; acqDate: string; acqTime: string; satellite: string }): string {
  return `${f.lat.toFixed(4)}_${f.lng.toFixed(4)}_${f.acqDate}_${(f.acqTime || "").padStart(4, "0")}_${f.satellite}`;
}

/** FIRMS acquisition date (YYYY-MM-DD) + HHMM UTC → ISO timestamp. */
export function detectedAtIso(acqDate: string, acqTime: string): string {
  const t = (acqTime || "0000").padStart(4, "0");
  const d = new Date(`${acqDate}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
