// Loaded only when the timeline has places to show: Leaflet is a sizeable library.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Visit } from "../../core/types";

export default function MapView({ visits, onSelect }: { visits: Visit[]; onSelect: (visitId: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const latest = useRef(visits);
  latest.current = visits;
  // Only redraw when the pins themselves change, not on every keystroke elsewhere.
  const signature = visits.map(v => `${v.visit}:${v.lat}:${v.lon}:${v.loved ? 1 : 0}`).join("|");

  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, lg = layer.current, visits = latest.current;
    if (!m || !lg) return;
    lg.clearLayers();
    for (const v of visits) {
      L.marker([v.lat!, v.lon!], {
        icon: L.divIcon({ className: "", html: `<div class="tl-pin${v.loved ? " loved" : ""}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
        title: v.name, alt: v.name
      }).on("click", () => select.current(v.visit)).addTo(lg);
    }
    if (visits.length === 1) m.setView([visits[0].lat!, visits[0].lon!], 15);
    else m.fitBounds(visits.map(v => [v.lat!, v.lon!] as [number, number]), { padding: [24, 24], maxZoom: 15 });
  }, [signature]);

  return <div ref={box} style={{ height: "100%" }} />;
}
