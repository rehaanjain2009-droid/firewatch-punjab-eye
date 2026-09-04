import type { LiveFire } from "@/components/dashboard/MapView";

type Raw = {
  id: string;
  latitude: number;
  longitude: number;
  frp: number;
  confidence: "h" | "n" | "l";
  acq_date: string;
  acq_time: string;
  source: string;
};

const RAW: Raw[] = [
  // sim-1 is deliberately placed inside the Focal Point industrial belt southeast of Ludhiana
  // so that the urban / industrial mask suppresses it during Demo Mode.
  { id: "sim-1", latitude: 30.85, longitude: 75.94, frp: 7.2, confidence: "h", acq_date: "2023-11-05", acq_time: "1400", source: "VIIRS_SNPP_NRT" },
  { id: "sim-2", latitude: 30.850, longitude: 75.950, frp: 12.5, confidence: "h", acq_date: "2023-11-05", acq_time: "1415", source: "MODIS_NRT" },
  { id: "sim-3", latitude: 30.880, longitude: 75.830, frp: 3.4, confidence: "n", acq_date: "2023-11-05", acq_time: "1430", source: "NOAA20_VIIRS_NRT" },
];

const CONF: Record<Raw["confidence"], number> = { h: 90, n: 60, l: 30 };

/** Historical Ludhiana detections used for stakeholder demos (Demo Mode). */
export const DEMO_FIRES: Omit<LiveFire, "block">[] = RAW.map((r) => {
  const hour = Number(r.acq_time.slice(0, 2));
  return {
    id: r.id,
    lat: r.latitude,
    lng: r.longitude,
    confidence: CONF[r.confidence],
    brightness: 300 + r.frp * 2,
    frp: r.frp,
    acqDate: r.acq_date,
    acqTime: r.acq_time,
    daynight: hour >= 6 && hour < 18 ? "D" : "N",
    satellite: r.source,
  };
});
