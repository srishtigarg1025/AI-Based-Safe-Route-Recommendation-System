import { Route, MapPin, AlertTriangle, Navigation, Target } from "lucide-react"

interface RouteDetailsCardProps {
  route: {
    distance: string
    duration: string
    coords: [number, number][]
    details?: {
      roadSegments: { road: string; distance: string; type: string; lanes: number }[]
      trafficSignals: number
      totalSteps: number
    }
  } | null
  ready: boolean
  source: string
  destination: string
  sourceCoords: [number, number] | null
  destCoords: [number, number] | null
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-400/10 text-green-400 border-green-400/25",
    amber: "bg-amber-400/10 text-amber-400 border-amber-400/25",
    red: "bg-red-400/10 text-red-400 border-red-400/25",
    blue: "bg-blue-400/10 text-blue-400 border-blue-400/25",
    purple: "bg-purple-400/10 text-purple-400 border-purple-400/25",
    muted: "bg-white/5 text-white/40 border-white/10",
    sky: "bg-sky-400/10 text-sky-400 border-sky-400/25",
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[color] || map.muted}`}>
      {children}
    </span>
  )
}

function Sk({ w = "100%", h = 14, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r }} />
}

function GlassBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-3 ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </div>
  )
}

export default function RouteDetailsCard({ route, ready, source, destination, sourceCoords, destCoords }: RouteDetailsCardProps) {
  if (!ready || !route) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Sk key={i} h={18} />)}
      </div>
    )
  }

  const details = route.details
  const segments = details?.roadSegments || []

  return (
    <div className="space-y-3">
      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-2">
        <GlassBox className="flex items-center gap-2.5">
          <Route className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div>
            <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--txt-muted)" }}>Distance</p>
            <p className="text-sm font-bold mono text-blue-400">{route.distance}</p>
          </div>
        </GlassBox>
        <GlassBox className="flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-purple-400 flex-shrink-0" />
          <div>
            <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--txt-muted)" }}>Duration</p>
            <p className="text-sm font-bold mono text-purple-400">{route.duration}</p>
          </div>
        </GlassBox>
      </div>

      {/* Source/Destination */}
      <GlassBox>
        <div className="flex items-start gap-2.5">
          <Target className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--txt-muted)" }}>Source</p>
            <p className="text-xs font-medium truncate" style={{ color: "var(--txt-primary)" }}>{source}</p>
            {sourceCoords && (
              <p className="text-[9px] mono mt-0.5" style={{ color: "var(--txt-muted)" }}>
                {sourceCoords[1].toFixed(4)}, {sourceCoords[0].toFixed(4)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2.5 mt-2">
          <MapPin className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--txt-muted)" }}>Destination</p>
            <p className="text-xs font-medium truncate" style={{ color: "var(--txt-primary)" }}>{destination}</p>
            {destCoords && (
              <p className="text-[9px] mono mt-0.5" style={{ color: "var(--txt-muted)" }}>
                {destCoords[1].toFixed(4)}, {destCoords[0].toFixed(4)}
              </p>
            )}
          </div>
        </div>
      </GlassBox>

      {/* Traffic signals */}
      <GlassBox>
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--txt-muted)" }}>Traffic Signals</p>
            <p className="text-sm font-bold mono text-amber-400">{details?.trafficSignals || 0} along route</p>
          </div>
        </div>
      </GlassBox>

      {/* Road segments */}
      {segments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--txt-muted)" }}>Road Segments</p>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {segments.map((seg, i) => (
              <div key={i}
                className="flex items-center justify-between p-2 rounded-lg text-[10px]"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div className="min-w-0 flex-1 mr-2">
                  <p className="font-medium truncate" style={{ color: "var(--txt-primary)" }}>{seg.road || "Unnamed road"}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Chip color={seg.type === "Highway" ? "blue" : seg.type === "Arterial" ? "purple" : "muted"}>{seg.type}</Chip>
                    <span className="text-[9px]" style={{ color: "var(--txt-muted)" }}>{seg.lanes} lanes</span>
                  </div>
                </div>
                <span className="font-semibold mono flex-shrink-0" style={{ color: "var(--txt-secondary)" }}>{seg.distance}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
