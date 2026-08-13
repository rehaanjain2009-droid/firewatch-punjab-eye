import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { LiveFire } from "./MapView";

type Props = {
  fire: LiveFire;
};

function Recenter({ center }: { center: LatLngExpression }) {
  const map = useMap();
  map.setView(center, 15, { animate: true, duration: 0.5 });
  return null;
}

export function BurnScarMiniMap({ fire }: Props) {
  const center: LatLngExpression = [fire.lat, fire.lng];
  const radius = Math.max(12, Math.min(60, (fire.frp ?? 0) * 0.8));

  return (
    <MapContainer
      center={center}
      zoom={15}
      scrollWheelZoom={false}
      className="h-[280px] w-full rounded-md border border-border"
    >
      <Recenter center={center} />
      <TileLayer
        attribution="&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      <CircleMarker
        center={center}
        radius={radius}
        pathOptions={{
          color: "oklch(0.65 0.24 25)",
          fillColor: "oklch(0.65 0.24 25)",
          fillOpacity: 0.55,
          weight: 2,
        }}
      />
    </MapContainer>
  );
}
