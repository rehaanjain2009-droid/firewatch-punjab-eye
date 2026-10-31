import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ScrollText, Search, Upload, Loader2, ExternalLink, History, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { StatusHeader } from "@/components/dashboard/StatusHeader";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { getMyProfile } from "@/lib/profile.functions";
import { updateIncident } from "@/lib/incidents.functions";
import type { AssignedOfficer } from "@/lib/officerMatch";

export const Route = createFileRoute("/_authenticated/audit")({
  loader: async () => ({ profile: await getMyProfile() }),
  component: AuditPage,
  head: () => ({
    meta: [
      { title: "Incident Audit Logs · PPF Ludhiana Stubble Fire Command" },
      { name: "description", content: "Permanent compliance history of every stubble fire alert: detection, officer assignment, dispatch, resolution, field notes and proof photos." },
      { property: "og:title", content: "Incident Audit Logs · PPF Ludhiana Stubble Fire Command" },
      { property: "og:description", content: "Permanent compliance history of every stubble fire alert for government oversight." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Incident = Tables<"incidents_audit_log">;
type Status = "active" | "dispatched" | "resolved" | "false_alarm";
type AssignedJson = { village?: string; block?: string; thana?: string | null; approximate?: boolean; officers?: AssignedOfficer[] };
type HistoryItem = { status: string; at: string; by?: string | null; from?: string; channel?: string | null };

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  active: { label: "Active", cls: "text-[oklch(0.78_0.22_25)] border-[oklch(0.65_0.24_25/0.5)] bg-[oklch(0.65_0.24_25/0.12)]" },
  dispatched: { label: "Dispatched", cls: "text-[oklch(0.85_0.10_220)] border-[oklch(0.78_0.10_220/0.5)] bg-[oklch(0.78_0.10_220/0.12)]" },
  resolved: { label: "Resolved", cls: "text-[oklch(0.85_0.18_155)] border-[oklch(0.78_0.18_155/0.5)] bg-[oklch(0.78_0.18_155/0.12)]" },
  false_alarm: { label: "False Alarm", cls: "text-[oklch(0.88_0.17_80)] border-[oklch(0.82_0.17_80/0.5)] bg-[oklch(0.82_0.17_80/0.12)]" },
};
const STATUSES = Object.keys(STATUS_META) as Status[];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, dateStyle: "medium", timeStyle: "short" }) : "—";

function officersOf(i: Incident): AssignedJson {
  const a = i.assigned_officers as unknown;
  return a && typeof a === "object" && !Array.isArray(a) ? (a as AssignedJson) : {};
}

async function fetchIncidents(): Promise<Incident[]> {
  const out: Incident[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supabase
      .from("incidents_audit_log")
      .select("*")
      .order("detected_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: Incident[]) {
  const header = [
    "incident_id", "fire_key", "detected_at_utc", "latitude", "longitude", "frp_mw", "confidence_pct", "satellite", "day_night",
    "village", "block", "police_station", "village_distance_km", "status",
    "patwari", "patwari_contact", "sho", "sho_contact", "nodal_officer", "nodal_officer_contact",
    "dispatched_at_utc", "dispatch_channel", "dispatch_count", "resolved_at_utc", "resolved_by",
    "field_notes", "proof_images", "status_history", "google_maps",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const a = officersOf(r);
    const by = (role: string) => a.officers?.find((o) => o.role === role);
    const p = by("Patwari"), s = by("SHO"), n = by("Nodal Officer");
    lines.push([
      r.id, r.fire_key, r.detected_at, r.lat, r.lng, r.frp, r.confidence, r.satellite, r.daynight,
      r.village, r.block, a.thana, r.village_distance_km, r.status,
      p?.name, p?.contact, s?.name, s?.contact, n?.name, n?.contact,
      r.dispatched_at, r.dispatch_channel, r.dispatch_count, r.resolved_at, r.resolved_by,
      r.field_notes, r.proof_image_urls.join(" | "), JSON.stringify(r.status_history),
      `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`,
    ].map(csvCell).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ppf-ludhiana-incident-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as Status] ?? STATUS_META.active;
  return <span className={`text-mono inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${m.cls}`}>{m.label}</span>;
}

function AuditPage() {
  const { profile } = Route.useLoaderData();
  const query = useQuery({ queryKey: ["incidents-audit"], queryFn: fetchIncidents, refetchInterval: 60_000 });
  const [status, setStatus] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = query.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      const day = r.detected_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      const a = officersOf(r);
      const hay = [r.village, r.block, r.satellite, r.fire_key, r.field_notes, a.thana, ...(a.officers ?? []).map((o) => `${o.name} ${o.contact ?? ""}`)]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [all, status, search, from, to]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { active: 0, dispatched: 0, resolved: 0, false_alarm: 0 };
    for (const r of all) if (r.status in c) c[r.status as Status] += 1;
    return c;
  }, [all]);

  const open = all.find((r) => r.id === openId) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusHeader variant="nav" email={profile?.email ?? null} telegramHandle={profile?.telegram_handle ?? null} />
      <main className="mx-auto max-w-[1600px] space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-wide"><ScrollText className="h-5 w-5 text-primary" /> INCIDENT AUDIT LOG</h2>
            <p className="text-mono text-[11px] text-muted-foreground">
              Permanent compliance record · entries cannot be deleted · every status change is time-stamped
            </p>
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV ({filtered.length})
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <button onClick={() => setStatus("all")} className={`panel px-3 py-2 text-left ${status === "all" ? "border-primary/60" : ""}`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">All incidents</div>
            <div className="text-mono text-2xl font-bold">{all.length}</div>
          </button>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`panel px-3 py-2 text-left ${status === s ? "border-primary/60" : ""}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{STATUS_META[s].label}</div>
              <div className="text-mono text-2xl font-bold">{counts[s]}</div>
            </button>
          ))}
        </div>

        <div className="panel flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded border border-border bg-background/40 px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search village, block, officer, phone, notes…"
              aria-label="Search incidents"
              className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")} aria-label="Status filter" className="h-8 rounded border border-border bg-background/40 px-2 text-sm">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <label className="text-mono flex items-center gap-1 text-[10px] uppercase text-muted-foreground">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded border border-border bg-background/40 px-2 text-sm text-foreground" />
          </label>
          <label className="text-mono flex items-center gap-1 text-[10px] uppercase text-muted-foreground">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded border border-border bg-background/40 px-2 text-sm text-foreground" />
          </label>
        </div>

        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="text-mono border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Detected (IST)</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">FRP / Conf.</th>
                <th className="px-3 py-2">Assigned officers</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Dispatched</th>
                <th className="px-3 py-2">Resolved</th>
                <th className="px-3 py-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading audit history…</td></tr>
              )}
              {query.error && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-destructive">Could not load incidents: {(query.error as Error).message}</td></tr>
              )}
              {!query.isLoading && filtered.length === 0 && !query.error && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No incidents match these filters.</td></tr>
              )}
              {filtered.map((r) => {
                const a = officersOf(r);
                return (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b border-border/60 hover:bg-accent/30">
                    <td className="text-mono px-3 py-2 whitespace-nowrap">{fmt(r.detected_at)}<div className="text-[10px] text-muted-foreground">{r.satellite}</div></td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.village ?? "—"}{r.block ? <span className="font-normal text-muted-foreground"> · {r.block}</span> : null}</div>
                      <div className="text-mono text-[10px] text-muted-foreground">{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</div>
                    </td>
                    <td className="text-mono px-3 py-2 whitespace-nowrap">{r.frp.toFixed(1)} MW<div className="text-[10px] text-muted-foreground">{r.confidence}%</div></td>
                    <td className="px-3 py-2">
                      {(a.officers ?? []).map((o) => (
                        <div key={o.role} className="truncate text-[11px]"><span className="text-mono text-[9px] uppercase text-muted-foreground">{o.role}:</span> {o.name} {o.contact && <span className="text-mono text-muted-foreground">· {o.contact}</span>}</div>
                      ))}
                      {!a.officers?.length && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="text-mono px-3 py-2 whitespace-nowrap">{fmt(r.dispatched_at)}{r.dispatch_channel && <div className="text-[10px] text-muted-foreground">{r.dispatch_channel.replace("_", " ")} ×{r.dispatch_count}</div>}</td>
                    <td className="text-mono px-3 py-2 whitespace-nowrap">{fmt(r.resolved_at)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.field_notes ? "📝 " : ""}{r.proof_image_urls.length ? `📷 ${r.proof_image_urls.length}` : ""}{!r.field_notes && !r.proof_image_urls.length ? "—" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      <IncidentSheet incident={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function IncidentSheet({ incident, onClose }: { incident: Incident | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const update = useServerFn(updateIncident);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    setNotes(incident?.field_notes ?? "");
    setError(null);
  }, [incident?.id, incident?.field_notes]);

  const paths = incident?.proof_image_urls ?? [];
  useEffect(() => {
    const storagePaths = paths.filter((p) => !/^https?:\/\//.test(p));
    if (storagePaths.length === 0) { setSigned({}); return; }
    supabase.storage.from("incident-proofs").createSignedUrls(storagePaths, 3600).then(({ data }) => {
      const m: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      setSigned(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join("|")]);

  if (!incident) return <Sheet open={false} onOpenChange={() => onClose()}><SheetContent /></Sheet>;

  const a = officersOf(incident);
  const history = (Array.isArray(incident.status_history) ? incident.status_history : []) as unknown as HistoryItem[];

  const save = async (patch: { status?: Status; fieldNotes?: string; proofImageUrls?: string[] }) => {
    setSaving(true);
    setError(null);
    try {
      await update({ data: { id: incident.id, ...patch } });
      await queryClient.invalidateQueries({ queryKey: ["incidents-audit"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const path = `${incident.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("incident-proofs").upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        added.push(path);
      }
      await save({ proofImageUrls: [...incident.proof_image_urls, ...added] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{incident.village ?? "Unmatched location"} <StatusBadge status={incident.status} /></SheetTitle>
          <SheetDescription className="text-mono text-[11px]">
            {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)} · FRP {incident.frp.toFixed(1)} MW · {incident.confidence}% · {incident.satellite}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          <a href={`https://www.google.com/maps/search/?api=1&query=${incident.lat},${incident.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Open in Google Maps
          </a>

          <section>
            <h4 className="text-mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Assigned officers · {a.block ?? incident.block ?? "—"} block{a.thana ? ` · PS ${a.thana}` : ""}</h4>
            {(a.officers ?? []).map((o) => (
              <div key={o.role} className="flex justify-between gap-2 border-b border-border/50 py-1 text-xs">
                <span><span className="text-muted-foreground">{o.role}:</span> {o.name}</span>
                {o.contact && <a className="text-mono text-primary" href={`tel:${o.contact.split(/[&,/]/)[0].replace(/[^0-9+]/g, "")}`}>{o.contact}</a>}
              </div>
            ))}
            {a.approximate && <p className="mt-1 text-[11px] text-[oklch(0.88_0.17_80)]">Nearest listed village is {incident.village_distance_km} km away — confirm jurisdiction.</p>}
          </section>

          <section>
            <h4 className="text-mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Status</h4>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={saving || incident.status === s}
                  onClick={() => save({ status: s })}
                  className={`text-mono rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${incident.status === s ? STATUS_META[s].cls : "border-border text-muted-foreground hover:text-foreground"} disabled:cursor-default`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
            <dl className="text-mono mt-2 grid grid-cols-2 gap-1 text-[11px]">
              <dt className="text-muted-foreground">Detected</dt><dd>{fmt(incident.detected_at)}</dd>
              <dt className="text-muted-foreground">Dispatched</dt><dd>{fmt(incident.dispatched_at)}</dd>
              <dt className="text-muted-foreground">Resolved</dt><dd>{fmt(incident.resolved_at)}</dd>
            </dl>
          </section>

          <section>
            <h4 className="text-mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Field notes</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Inspection findings, challan number, farmer details…"
              className="w-full rounded border border-border bg-background/40 p-2 text-sm outline-none focus:border-primary/60"
            />
            <button
              disabled={saving || notes === (incident.field_notes ?? "")}
              onClick={() => save({ fieldNotes: notes })}
              className="mt-1 rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save notes"}
            </button>
          </section>

          <section>
            <h4 className="text-mono mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><ImageIcon className="h-3 w-3" /> Proof images</h4>
            <div className="grid grid-cols-3 gap-2">
              {paths.map((p) => {
                const src = /^https?:\/\//.test(p) ? p : signed[p];
                return src ? (
                  <a key={p} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Field proof" className="h-24 w-full rounded border border-border object-cover" /></a>
                ) : (
                  <div key={p} className="flex h-24 items-center justify-center rounded border border-border text-[10px] text-muted-foreground">loading…</div>
                );
              })}
            </div>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary/50">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} disabled={uploading} />
            </label>
          </section>

          <section>
            <h4 className="text-mono mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><History className="h-3 w-3" /> Lifecycle history</h4>
            <ol className="space-y-1 border-l border-border pl-3">
              {history.map((h, i) => (
                <li key={i} className="text-mono text-[11px]">
                  <StatusBadge status={h.status} /> <span className="text-muted-foreground">{fmt(h.at)}</span>
                  {h.channel && <span className="text-muted-foreground"> · {h.channel}</span>}
                  {h.by ? <span className="text-muted-foreground"> · officer {h.by.slice(0, 8)}</span> : <span className="text-muted-foreground"> · system</span>}
                </li>
              ))}
            </ol>
          </section>

          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
