import { useEffect } from "react"
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

type RouteKey = "safe" | "moderate" | "risky"

interface SegmentPrediction {
  segmentIndex: number
  road: string
  type: string
  distanceKm: number
  predicted_risk: number
  hotspot_count: number
  severity: string
  penalty: number
  final_risk: number
  explanation: string
}

interface RouteData {
  key: RouteKey
  label: string
  distance: string
  duration: string
  coords: [number, number][]
  details?: {
    roadSegments: {
      road: string
      distance: string
      type: string
      lanes: number
      coords: [number, number][]
    }[]
    trafficSignals: number
    totalSteps: number
  }
  prediction?: {
    predicted_risk: number
    hotspot_count: number
    severity: string
    penalty: number
    final_risk: number
    explanation: string
    segment_predictions?: SegmentPrediction[]
  }
}

function riskColor(risk: number): string {
  if (risk <= 0.35) return "#22c55e"
  if (risk <= 0.65) return "#f59e0b"
  return "#ef4444"
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
          const isSelected = selected === route.key

          if (isSelected) {
            const segments = route.details?.roadSegments || []
            const segPreds = route.prediction?.segment_predictions || []
            const overallRisk = route.prediction?.final_risk ?? 0.5

            return (
              <div key={route.key}>
                <Polyline
                  positions={route.coords.map(c => [c[1], c[0]])}
                  pathOptions={{ color: riskColor(overallRisk), weight: 3, opacity: 0.15, dashArray: "6 4" }}
                  interactive={false}
                />
                {segments.map((seg, i) => {
                  if (!seg.coords || seg.coords.length < 2) return null
                  const pred = segPreds.find(p => p.segmentIndex === i)
                  const risk = pred?.final_risk ?? overallRisk
                  const color = riskColor(risk)
                  return (
                    <Polyline
                      key={`seg-${i}`}
                      positions={seg.coords.map(c => [c[1], c[0]] as [number, number])}
                      pathOptions={{ color, weight: 7, opacity: 0.95 }}
                      eventHandlers={{ click: () => onSelect(route.key) }}
                    >
                      <Popup>
                        <div style={{ fontFamily: "system-ui", fontSize: 11, minWidth: 160, lineHeight: 1.6 }}>
                          <strong style={{ color }}>{seg.road || "Unnamed Road"}</strong>
                          <br />
                          <span style={{ color: "#888" }}>Segment {i + 1}</span>
                          <br />
                          Distance: {seg.distance}
                          <br />
                          Risk: <strong style={{ color }}>{pred ? `${Math.round(pred.final_risk * 100)}%` : "N/A"}</strong>
                          {pred && (
                            <>
                              <br />
                              Severity: {pred.severity}
                              <br />
                              Hotspots: {pred.hotspot_count}
                              <br />
                              <span style={{ color: "#888", fontSize: 10 }}>{pred.explanation}</span>
                            </>
                          )}
                        </div>
                      </Popup>
                    </Polyline>
                  )
                })}
              </div>
            )
          }

          const style = ROUTE_STYLES[route.key]
          return (
            <Polyline
              key={route.key}
              positions={route.coords.map(c => [c[1], c[0]])}
              pathOptions={{ ...style, opacity: 0.4 }}
              eventHandlers={{ click: () => onSelect(route.key) }}
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
