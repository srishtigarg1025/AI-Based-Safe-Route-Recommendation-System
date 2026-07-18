import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Toaster, toast } from "sonner"
import {
  MapPin, Clock, Cloud, Car, Bike, Train, Bus,
  AlertTriangle, CheckCircle,
  RefreshCw, Sun, Moon, Zap, Brain, X, Navigation,
  Route, Map, Target,
} from "lucide-react"
import MapView from "./components/MapView"
import RouteDetailsCard from "./components/RouteDetailsCard"

const API_BASE = "https://ai-based-safe-route-recommendation.onrender.com"

interface RouteData {
  key: "safe" | "moderate" | "risky"
  label: string
  distance: string
  duration: string
  coords: [number, number][]
  details?: {
    roadSegments: { road: string; distance: string; type: string; lanes: number }[]
    trafficSignals: number
    totalSteps: number
  }
  prediction?: PredictionResult
}

interface WeatherData {
  temperature: number
  feelsLike: number
  humidity: number
  precipitation: number
  windSpeed: number
  condition: string
  icon: string
}

interface PredictionResult {
  predicted_risk: number
  hotspot_count: number
  severity: string
  penalty: number
  final_risk: number
  explanation: string
}

// ─── CSS injected animations ───────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes routeDraw {
    from { stroke-dashoffset: 1200; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes routePulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.55; }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes floatY {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-5px); }
  }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 18px rgba(59,130,246,0.28); }
    50%       { box-shadow: 0 0 38px rgba(59,130,246,0.55), 0 0 70px rgba(99,102,241,0.22); }
  }
  @keyframes cursorBlink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @keyframes spin360 {
    to { transform: rotate(360deg); }
  }
  @keyframes bounceIn {
    0%   { transform: scale(0.85); opacity: 0; }
    60%  { transform: scale(1.04); }
    100% { transform: scale(1);    opacity: 1; }
  }
  .route-draw {
    stroke-dasharray: 1200;
    stroke-dashoffset: 1200;
    animation: routeDraw 2.2s cubic-bezier(0.4,0,0.2,1) forwards;
  }
  .route-pulse { animation: routePulse 2s ease-in-out infinite; }
  .sk {
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0%,
      rgba(255,255,255,0.10) 50%,
      rgba(255,255,255,0.04) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.6s infinite;
  }
  .float-card { animation: floatY 8s ease-in-out infinite; }
  .glow-card  { animation: glowPulse 3s ease-in-out infinite; }
  .cursor-blink { animation: cursorBlink 1s step-end infinite; }
  .spinner { animation: spin360 0.75s linear infinite; }
  body { font-family: 'DM Sans', system-ui, sans-serif; }
  h1, h2, h3, .exo { font-family: 'Exo 2', system-ui, sans-serif; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
  .input-field {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--txt-primary);
    border-radius: 0.75rem;
    padding: 0.55rem 0.75rem 0.55rem 2.2rem;
    font-size: 0.82rem;
    width: 100%;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .input-field:focus {
    border-color: rgba(99,102,241,0.55);
    box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
  }
  .input-field::placeholder { color: var(--txt-muted); }
  select.input-field option { background: #0d1530; color: #e2e8f0; }
  input[type="datetime-local"].input-field::-webkit-calendar-picker-indicator { filter: invert(0.5); }
`

// ─── Types ──────────────────────────────────────────────────────────────────
type RouteKey = "safe" | "moderate" | "risky"
type TravelMode = "car" | "bike" | "transit" | "walk"

const ROUTE_COLORS: Record<string, string> = {
  safe: "#22c55e",
  moderate: "#f59e0b",
  risky: "#ef4444",
}

function riskLabel(finalRisk: number): { route: string; chip: string; chipColor: "green" | "amber" | "red" } {
  if (finalRisk <= 0.35) return { route: "Safe Route", chip: "Low Risk", chipColor: "green" }
  if (finalRisk <= 0.65) return { route: "Moderate Route", chip: "Moderate", chipColor: "amber" }
  return { route: "Risky Route", chip: "High Risk", chipColor: "red" }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function useTypingEffect(text: string, speed = 18, active = false) {
  const [out, setOut] = useState("")
  useEffect(() => {
    if (!active) { setOut(""); return }
    setOut("")
    let i = 0
    const t = setInterval(() => {
      i++
      setOut(text.slice(0, i))
      if (i >= text.length) clearInterval(t)
    }, speed)
    return () => clearInterval(t)
  }, [text, speed, active])
  return out
}

// ─── Shared UI ──────────────────────────────────────────────────────────────
function Glass({ children, className = "", style = {}, onClick }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`relative backdrop-blur-xl rounded-2xl transition-all duration-300 ${className}`}
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Chip({ color, children }: { color: "green" | "amber" | "red" | "blue" | "purple" | "muted"; children: React.ReactNode }) {
  const map = {
    green:  "bg-green-400/10 text-green-400 border-green-400/25",
    amber:  "bg-amber-400/10 text-amber-400 border-amber-400/25",
    red:    "bg-red-400/10 text-red-400 border-red-400/25",
    blue:   "bg-blue-400/10 text-blue-400 border-blue-400/25",
    purple: "bg-purple-400/10 text-purple-400 border-purple-400/25",
    muted:  "bg-white/5 text-white/40 border-white/10",
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[color]}`}>
      {children}
    </span>
  )
}

function Bar2({ value, color = "blue" }: { value: number; color?: string }) {
  const map: Record<string, string> = {
    green: "#22c55e", amber: "#f59e0b", red: "#ef4444",
    blue: "#3b82f6", purple: "#8b5cf6", sky: "#38bdf8",
  }
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: map[color] ?? map.blue, boxShadow: `0 0 8px ${map[color] ?? map.blue}60` }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  )
}

function Sk({ w = "100%", h = 14, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div className="sk" style={{ width: w, height: h, borderRadius: r }} />
}

function RiskGauge({ value }: { value: number }) {
  const r = 42
  const cx = 58, cy = 58
  const toR = (d: number) => (d * Math.PI) / 180
  const sx = cx + r * Math.cos(toR(-180)), sy = cy + r * Math.sin(toR(-180))
  const ex = cx + r * Math.cos(toR(0)),   ey = cy + r * Math.sin(toR(0))
  const va = -180 + (value / 100) * 180
  const vx = cx + r * Math.cos(toR(va)), vy = cy + r * Math.sin(toR(va))
  const clr = value < 33 ? "#22c55e" : value < 66 ? "#f59e0b" : "#ef4444"
  const lbl = value < 33 ? "Low" : value < 66 ? "Moderate" : "High"
  return (
    <svg width={116} height={76} viewBox="0 0 116 76">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${vx} ${vy}`} fill="none" stroke={clr} strokeWidth="9" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${clr})` }} />
      <text x="58" y="60" textAnchor="middle" fill="white" fontSize="15" fontWeight="700">{value}</text>
      <text x="58" y="72" textAnchor="middle" fill={clr} fontSize="8" fontWeight="600">{lbl}</text>
    </svg>
  )
}

// ─── AI Panel ───────────────────────────────────────────────────────────────
function AIPanel({ sel, ready, onClose, routes, prediction, weather }: {
  sel: RouteKey; ready: boolean; onClose: () => void
  routes: RouteData[]; prediction: PredictionResult | null; weather: WeatherData | null
}) {
  const p = prediction
  const explanation = useTypingEffect(p?.explanation || "", 18, ready && !!p?.explanation)
  const bestRoute = routes[0]
  const riskValue = p ? Math.round(p.final_risk * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--glass-border)" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          <span className="text-sm font-semibold exo" style={{ color: "var(--txt-primary)" }}>AI Analysis</span>
        </div>
        <button onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: "var(--txt-muted)" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {!ready || !p ? (
          <div className="space-y-3 pt-2">
            {[100, 75, 90, 55, 80, 60, 70].map((w, i) => (
              <Sk key={i} w={`${w}%`} h={12} />
            ))}
          </div>
        ) : (
          <>
            {/* Risk Score */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--txt-muted)" }}>Risk Score</p>
                <Chip color={riskValue <= 35 ? "green" : riskValue <= 65 ? "amber" : "red"}>{p.severity}</Chip>
              </div>
              <div className="flex items-center gap-3">
                <RiskGauge value={riskValue} />
                <div className="flex-1 space-y-2">
                  {routes.map(r => {
                    const rv = r.prediction ? Math.round(r.prediction.final_risk * 100) : 0
                    return (
                      <div key={r.key}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span style={{ color: "var(--txt-muted)" }}>{r.label}</span>
                          <span style={{ color: ROUTE_COLORS[r.key] }} className="font-semibold mono">{rv}</span>
                        </div>
                        <Bar2 value={rv} color={r.key === "safe" ? "green" : r.key === "moderate" ? "amber" : "red"} />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Best Route */}
            {bestRoute && (() => {
              const br = bestRoute
              const brl = br.prediction ? riskLabel(br.prediction.final_risk) : null
              const brLabel = brl ? brl.route : "Best Route"
              return (
                <div className="p-3 rounded-xl"
                  style={{ background: `rgba(34,197,94,0.08)`, border: `1px solid rgba(34,197,94,0.22)` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide">Recommended</span>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "var(--txt-primary)" }}>{brLabel}</p>
                  <p className="text-[10px] mt-0.5 mono" style={{ color: "var(--txt-muted)" }}>{br.distance} · {br.duration} · Risk {riskValue}/100</p>
                </div>
              )
            })()}

            {/* AI Explanation */}
            {p.explanation && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--txt-muted)" }}>AI Explanation</p>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--txt-secondary)" }}>
                  {explanation}
                  {explanation.length < (p.explanation?.length || 0) && (
                    <span className="cursor-blink inline-block w-0.5 h-3 bg-blue-400 ml-0.5 align-middle rounded-full" />
                  )}
                </p>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Severity",   val: p.severity,          color: "text-blue-400" },
                { label: "Hotspots",   val: `${p.hotspot_count}`, color: "text-purple-400" },
                { label: "Penalty",    val: `+${(p.penalty * 100).toFixed(0)}%`, color: "text-sky-400" },
                { label: "Weather",    val: weather?.condition || "N/A", color: "text-amber-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="p-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: "var(--txt-muted)" }}>{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{val}</p>
                </div>
              ))}
            </div>

            {/* Hotspot & Penalty detail */}
            {p.hotspot_count > 0 && (
              <div className="p-3 rounded-xl"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <p className="text-[10px] font-medium" style={{ color: "var(--txt-secondary)" }}>
                  Route passes through <strong className="text-amber-400">{p.hotspot_count} accident hotspot{p.hotspot_count !== 1 ? "s" : ""}</strong>.
                  Risk adjusted by +{(p.penalty * 100).toFixed(0)}%.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Route Comparison ───────────────────────────────────────────────────────
function RouteComparisonCard({ routes, sel }: { routes: RouteData[]; sel: RouteKey }) {
  if (routes.length === 0) return (
    <div className="space-y-2.5">
      {[1, 2, 3].map(i => <Sk key={i} h={58} r={14} />)}
    </div>
  )
  return (
    <div className="space-y-2.5">
      {routes.map((r, idx) => {
        const active = sel === r.key
        const color = ROUTE_COLORS[r.key] || "#6366f1"
        const rl = r.prediction ? riskLabel(r.prediction.final_risk) : null
        return (
          <motion.div key={r.key}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="flex items-center gap-3 p-3 rounded-xl transition-all"
            style={{
              background: active ? `${color}12` : "rgba(255,255,255,0.03)",
              border: `1px solid ${active ? color + "38" : "rgba(255,255,255,0.06)"}`,
            }}>
            <div className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold" style={{ color: "var(--txt-primary)" }}>{rl ? rl.route : r.key}</span>
                {rl && <Chip color={rl.chipColor}>{rl.chip}</Chip>}
              </div>
              <p className="text-[10px] mono" style={{ color: "var(--txt-muted)" }}>
                {r.distance} · {r.duration}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-extrabold mono" style={{ color }}>
                {r.prediction ? Math.round(r.prediction.final_risk * 100) : r.distance.replace(" km", "")}
              </div>
              <div className="text-[9px]" style={{ color: "var(--txt-muted)" }}>
                {r.prediction ? `/ 100` : r.duration}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── ML Prediction ──────────────────────────────────────────────────────────
function MLPredictionCard({ prediction }: { prediction: PredictionResult | null }) {
  if (!prediction) return (
    <div className="space-y-3">
      <div className="flex justify-center"><Sk w={116} h={76} r={12} /></div>
      {[1, 2, 3, 4, 5].map(i => <Sk key={i} h={20} />)}
    </div>
  )
  const riskValue = Math.round(prediction.final_risk * 100)
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--txt-muted)" }}>ML Risk Score</p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold mono"
              style={{ color: riskValue <= 35 ? "#22c55e" : riskValue <= 65 ? "#f59e0b" : "#ef4444" }}>{riskValue}</span>
            <span className="text-sm" style={{ color: "var(--txt-muted)" }}>/ 100</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Chip color={riskValue <= 35 ? "green" : riskValue <= 65 ? "amber" : "red"}>{prediction.severity}</Chip>
            <Chip color="purple">{prediction.hotspot_count} hotspot{prediction.hotspot_count !== 1 ? "s" : ""}</Chip>
          </div>
        </div>
        <RiskGauge value={riskValue} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: "var(--txt-muted)" }}>Predicted Risk</p>
          <p className="text-sm font-bold mono" style={{ color: "var(--txt-primary)" }}>{(prediction.predicted_risk * 100).toFixed(1)}%</p>
        </div>
        <div className="p-3 rounded-xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: "var(--txt-muted)" }}>Hotspot Penalty</p>
          <p className="text-sm font-bold mono" style={{ color: "var(--txt-primary)" }}>+{(prediction.penalty * 100).toFixed(0)}%</p>
        </div>
      </div>

      {prediction.explanation && (
        <div className="p-3 rounded-xl text-[10px] leading-relaxed"
          style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)", color: "var(--txt-muted)" }}>
          {prediction.explanation}
        </div>
      )}
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(true)
  const [source, setSource] = useState("Connaught Place, New Delhi")
  const [dest,   setDest]   = useState("Cyber City, Gurugram")
  const [mode,   setMode]   = useState<TravelMode>("car")
  const [busy,   setBusy]   = useState(false)
  const [ready,  setReady]  = useState(false)
  const [sel,    setSel]    = useState<RouteKey>("safe")
  const [aiOpen, setAIOpen] = useState(true)
  const [routes, setRoutes] = useState<RouteData[]>([])
  const [sourceCoords, setSourceCoords] = useState<[number, number] | null>(null)
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null)
  const [calendar, setCalendar] = useState<{ date: string; dayOfWeek: string; isWeekend: boolean } | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [mapResetKey, setMapResetKey] = useState(0)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
  }, [isDark])

  useEffect(() => {
    fetch(`${API_BASE}/api/calendar`)
      .then(r => r.json())
      .then(setCalendar)
      .catch(() => {
        const now = new Date()
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        setCalendar({
          date: now.toISOString().slice(0, 10),
          dayOfWeek: days[now.getDay()],
          isWeekend: now.getDay() === 0 || now.getDay() === 6,
        })
      })
  }, [])

  const analyze = useCallback(async () => {
    if (!source.trim() || !dest.trim()) {
      toast.error("Please enter both source and destination")
      return
    }
    setBusy(true)
    setReady(false)
    setRoutes([])
    setSourceCoords(null)
    setDestCoords(null)
    setWeather(null)
    toast.loading("Fetching routes & running ML analysis…", { id: "analyze" })
    try {
      const res = await fetch(`${API_BASE}/api/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, destination: dest }),
      })
      if (!res.ok) throw new Error("Routing API error")
      const data = await res.json()
      if (!data.routes || data.routes.length === 0) {
        throw new Error("No routes found")
      }
      setRoutes(data.routes)
      setSourceCoords(data.sourceCoords)
      setDestCoords(data.destCoords)
      setWeather(data.weather?.destination || data.weather?.path || null)
      setSel(data.routes[0].key)
      setBusy(false)
      setReady(true)
      setAIOpen(true)
      toast.success(`Found ${data.routes.length} routes — safest recommended!`, { id: "analyze" })
    } catch (err) {
      setBusy(false)
      toast.error("Failed to fetch routes. Is the backend running?", { id: "analyze" })
      console.error(err)
    }
  }, [source, dest])

  const travelModes: { key: TravelMode; Icon: typeof Car; label: string }[] = [
    { key: "car",     Icon: Car,   label: "Car" },
    { key: "bike",    Icon: Bike,  label: "Bike" },
    { key: "transit", Icon: Train, label: "Transit" },
    { key: "walk",    Icon: Bus,   label: "Walk" },
  ]

  const selectedRoute = routes.find(r => r.key === sel) || null
  const activePrediction = selectedRoute?.prediction || null

  const cards = [
    { id: "cmp", title: "Route Comparison",     Icon: Route,        accent: "#3b82f6", content: <RouteComparisonCard routes={routes} sel={sel} /> },
    { id: "ml",  title: "ML Prediction",         Icon: Brain,        accent: "#8b5cf6", content: <MLPredictionCard prediction={activePrediction} /> },
    { id: "rd",  title: "Route Details",         Icon: Map,          accent: "#06b6d4", content: <RouteDetailsCard route={selectedRoute} ready={ready} source={source} destination={dest} sourceCoords={sourceCoords} destCoords={destCoords} weather={weather} prediction={activePrediction} /> },
  ]

  const bgStyle = {
    background: isDark
      ? "linear-gradient(135deg, #060b18 0%, #0a0f1e 45%, #090d1f 100%)"
      : "linear-gradient(135deg, #f0f4ff 0%, #e8edf5 55%, #eef2ff 100%)",
  }

  return (
    <div className="min-h-screen w-full" style={bgStyle}>
      <style dangerouslySetInnerHTML={{ __html: ANIM_CSS }} />
      <Toaster position="top-right" theme={isDark ? "dark" : "light"} richColors />

      {/* Ambient orbs */}
      {isDark && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-12 w-96 h-96 rounded-full opacity-[0.08]"
            style={{ background: "radial-gradient(circle, #3b82f6, transparent 70%)" }} />
          <div className="absolute -bottom-20 -right-10 w-80 h-80 rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)" }} />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-[0.05]"
            style={{ background: "radial-gradient(circle, #22c55e, transparent 70%)" }} />
        </div>
      )}

      <div className="relative z-10 max-w-[1640px] mx-auto px-4 sm:px-6 py-4">

        {/* ── Header ── */}
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 glow-card"
              style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-extrabold exo leading-none" style={{ color: "var(--txt-primary)" }}>TrafficAI</h1>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--txt-muted)" }}>Risk & Route Intelligence Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {calendar && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-medium"
                style={{
                  background: calendar.isWeekend ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.08)",
                  border: `1px solid ${calendar.isWeekend ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.15)"}`,
                  color: calendar.isWeekend ? "#f59e0b" : "var(--txt-secondary)",
                }}>
                <span className="font-semibold">{calendar.date}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{calendar.dayOfWeek}</span>
                {calendar.isWeekend && (
                  <span className="text-[9px] text-amber-400 font-bold ml-0.5">(Weekend)</span>
                )}
              </div>
            )}
            <Chip color="green">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Live
            </Chip>

            {/* Theme */}
            <button onClick={() => setIsDark(d => !d)}
              className="p-2 rounded-xl transition-all"
              style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--txt-muted)" }}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* ── Hero Input Panel ── */}
        <Glass className="mb-5 p-5 float-card" style={{ animationDuration: "9s" }}>
          <div className="mb-4">
            <h2 className="text-xl sm:text-2xl font-extrabold exo leading-tight" style={{ color: "var(--txt-primary)" }}>
              AI Traffic Risk &{" "}
              <span style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Safe Route Assistant
              </span>
            </h2>
            <p className="text-xs mt-1.5" style={{ color: "var(--txt-muted)" }}>
              ML-powered risk scoring · Real-time accident data · GenAI route recommendations · Weather-aware analysis
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            {/* Source */}
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--txt-muted)" }}>Source</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400" />
                <input value={source} onChange={e => setSource(e.target.value)}
                  placeholder="Starting location"
                  className="input-field" />
              </div>
            </div>

            {/* Destination */}
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--txt-muted)" }}>Destination</label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400" />
                <input value={dest} onChange={e => setDest(e.target.value)}
                  placeholder="Destination"
                  className="input-field" />
              </div>
            </div>

            {/* Time */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--txt-muted)" }}>Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sky-400" />
                <input type="time"
                  defaultValue={new Date(Date.now() + 15 * 60000).toTimeString().slice(0, 5)}
                  className="input-field" />
              </div>
            </div>

            {/* Weather */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--txt-muted)" }}>Weather</label>
              <div className="relative h-[38px] flex items-center">
                {weather ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl w-full text-xs"
                    style={{
                      background: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                      color: "var(--txt-secondary)",
                    }}>
                    <Cloud className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span className="font-medium">{weather.condition}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span className="mono">{weather.temperature}°C</span>
                    {weather.humidity > 0 && (
                      <>
                        <span style={{ opacity: 0.3 }}>|</span>
                        <span className="text-[10px]" style={{ opacity: 0.6 }}>{weather.humidity}% RH</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl w-full text-xs"
                    style={{
                      background: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                      color: "var(--txt-muted)",
                    }}>
                    <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Auto-detected after analysis</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--txt-muted)" }}>Travel Mode</label>
              <div className="flex gap-1.5">
                {travelModes.map(({ key, Icon, label }) => (
                  <button key={key} onClick={() => setMode(key)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                    style={{
                      background: mode === key ? "rgba(59,130,246,0.18)" : "var(--glass-bg)",
                      border: `1px solid ${mode === key ? "rgba(59,130,246,0.38)" : "var(--glass-border)"}`,
                      color: mode === key ? "#60a5fa" : "var(--txt-muted)",
                    }}>
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:ml-auto flex gap-2">
              <button
                onClick={() => { setSource(""); setDest(""); setReady(false); setWeather(null) }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-all"
                style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--txt-muted)" }}>
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={analyze}
                disabled={busy}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                style={{
                  background: busy ? "rgba(59,130,246,0.5)" : "linear-gradient(135deg, #3b82f6, #6366f1)",
                  boxShadow: busy ? "none" : "0 4px 22px rgba(59,130,246,0.38)",
                }}>
                {busy ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Analyze Safest Route
                  </>
                )}
              </button>
            </div>
          </div>
        </Glass>

        {/* ── Map + AI Panel ── */}
        <div className="flex gap-4 mb-5">
          {/* Map area */}
          <div className="flex-1 min-w-0">
            <Glass className="h-full relative overflow-hidden" style={{ minHeight: 430 }}>
              {/* Map controls */}
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
                {[
                  { Icon: RefreshCw, color: "text-green-400", tip: "Reset Map View", action: () => setMapResetKey(k => k + 1) },
                  { Icon: Brain,     color: "text-purple-400",tip: "AI Panel", action: () => setAIOpen(o => !o) },
                ].map(({ Icon, color, tip, action }) => (
                  <button key={tip} onClick={action} title={tip}
                    className="p-2.5 rounded-xl backdrop-blur-xl transition-all hover:scale-105 active:scale-95"
                    style={{ background: "rgba(8,13,28,0.82)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </button>
                ))}
              </div>

              {/* Route legend */}
              <AnimatePresence>
                {ready && (
                  <motion.div
                    initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                    className="absolute top-3 right-3 z-10 p-3 rounded-xl"
                    style={{ background: "rgba(8,13,28,0.82)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    {(["safe", "moderate", "risky"] as RouteKey[]).map(k => {
                      const r = routes.find(rr => rr.key === k)
                      if (!r) return null
                      return (
                        <button key={k} onClick={() => setSel(k)}
                          className="flex items-center gap-2 py-1 transition-all w-full"
                          style={{ opacity: sel === k ? 1 : 0.45 }}>
                          <div className="w-5 h-1.5 rounded-full" style={{ background: ROUTE_COLORS[k] || "#6366f1" }} />
                          <span className="text-[10px] font-medium text-left" style={{ color: "rgba(255,255,255,0.75)" }}>{r.label}</span>
                        </button>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              <MapView
                source={source}
                destination={dest}
                ready={ready}
                routes={routes}
                selected={sel}
                onSelect={setSel}
                sourceCoords={sourceCoords}
                destCoords={destCoords}
                resetKey={mapResetKey}
              />
            </Glass>
          </div>

          {/* AI Panel sidebar */}
          <AnimatePresence>
            {aiOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 296, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 22, stiffness: 200 }}
                className="flex-shrink-0 hidden lg:block overflow-hidden"
                style={{ minHeight: 430 }}>
                <Glass className="h-full overflow-hidden" style={{ minHeight: 430 }}>
                  <AIPanel sel={sel} ready={ready} onClose={() => setAIOpen(false)} routes={routes} prediction={activePrediction} weather={weather} />
                </Glass>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-10">
          {cards.map(({ id, title, Icon, accent, content }, i) => (
            <motion.div key={id}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.45, ease: "easeOut" }}>
              <Glass className="p-5 h-full">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}28` }}>
                    <Icon className="w-4 h-4" style={{ color: accent }} />
                  </div>
                  <h3 className="text-sm font-bold exo" style={{ color: "var(--txt-primary)" }}>{title}</h3>
                </div>
                {content}
              </Glass>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
