import { useEffect, useMemo, useRef } from "react"
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

L.Marker.prototype.options.icon = DefaultIcon

const ROUTE_STYLES: Record<string, { color: string; weight: number; opacity: number }> = {
  safe: { color: "#22c55e", weight: 6, opacity: 0.9 },
  moderate: { color: "#f59e0b", weight: 6, opacity: 0.9 },
  risky: { color: "#ef4444", weight: 6, opacity: 0.9 },
}

const SELECTED_STYLES: Record<string, { color: string; weight: number; opacity: number }> = {
  safe: { color: "#22c55e", weight: 8, opacity: 1 },
  moderate: { color: "#f59e0b", weight: 8, opacity: 1 },
  risky: { color: "#ef4444", weight: 8, opacity: 1 },
}

type RouteKey = "safe" | "moderate" | "risky"

interface RouteData {
  key: RouteKey
  label: string
  distance: string
  duration: string
  coords: [number, number][]
}

interface MapViewProps {
  source: string
  destination: string
  ready: boolean
  routes: RouteData[]
  selected: RouteKey
  onSelect: (key: RouteKey) => void
  sourceCoords: [number, number] | null
  destCoords: [number, number] | null
  resetKey?: number
}

function FitBounds({ routes, sourceCoords, destCoords, resetKey }: {
  routes: RouteData[]
  sourceCoords: [number, number] | null
  destCoords: [number, number] | null
  resetKey?: number
}) {
  const map = useMap()
  useEffect(() => {
    const points: [number, number][] = []
    if (sourceCoords) points.push(sourceCoords)
    if (destCoords) points.push(destCoords)
    if (routes.length > 0) {
      for (const r of routes) {
        for (const c of r.coords) points.push(c)
      }
    }
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[1], p[0])))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [routes, sourceCoords, destCoords, resetKey, map])
  return null
}

export default function MapView({ source, destination, ready, routes, selected, onSelect, sourceCoords, destCoords, resetKey }: MapViewProps) {
  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ minHeight: 420 }}>
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds routes={routes} sourceCoords={sourceCoords} destCoords={destCoords} resetKey={resetKey} />

        {routes.map((route) => {
          const coords: [number, number][] = route.coords.map(c => [c[1], c[0]])
          const isSelected = selected === route.key
          const style = isSelected ? SELECTED_STYLES[route.key] : ROUTE_STYLES[route.key]
          return (
            <Polyline
              key={route.key}
              positions={coords}
              pathOptions={{
                color: style.color,
                weight: style.weight,
                opacity: style.opacity,
              }}
              eventHandlers={{
                click: () => onSelect(route.key),
              }}
            >
              <Popup>
                <div style={{ fontFamily: "system-ui", fontSize: 12, minWidth: 140 }}>
                  <strong style={{ color: style.color }}>{route.label}</strong>
                  <br />
                  {route.distance} · {route.duration}
                </div>
              </Popup>
            </Polyline>
          )
        })}

        {sourceCoords && (
          <Marker position={[sourceCoords[1], sourceCoords[0]]}>
            <Popup>Source: {source}</Popup>
          </Marker>
        )}
        {destCoords && (
          <Marker position={[destCoords[1], destCoords[0]]}>
            <Popup>Destination: {destination}</Popup>
          </Marker>
        )}
      </MapContainer>

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl z-[1000] pointer-events-none"
          style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(2px)" }}>
          <div className="w-12 h-12 mb-3 opacity-30" style={{ color: "var(--txt-muted)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <p className="text-sm" style={{ color: "var(--txt-muted)" }}>Enter route details and click Analyze</p>
        </div>
      )}
    </div>
  )
}
