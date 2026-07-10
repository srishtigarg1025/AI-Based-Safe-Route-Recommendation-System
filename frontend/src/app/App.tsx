import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Toaster, toast } from "sonner"
import {
  MapPin, Clock, Cloud, Car, Bike, Train, Bus,
  AlertTriangle, CheckCircle, Bell, Mic, Phone,
  RefreshCw, Crosshair, Sun, Moon, Upload, Send,
  Zap, Shield, Brain, MessageSquare, X, Navigation,
  Eye, BarChart2, Route, Map, Target,
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import MapView from "./components/MapView"
import RouteDetailsCard from "./components/RouteDetailsCard"

const API_BASE = ""

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

// ─── Constants ──────────────────────────────────────────────────────────────
const ROUTES: Record<RouteKey, {
  label: string; color: string; distance: string; eta: string
  risk: number; roadType: string; accidents: number; riskLabel: string
  weather: string
}> = {
  safe: {
    label: "Northern Bypass", color: "#22c55e",
    distance: "14.2 km", eta: "28 min", risk: 12,
    roadType: "Highway + Arterial", accidents: 2,
    riskLabel: "Low Risk", weather: "Clear",
  },
  moderate: {
    label: "Ring Road Connector", color: "#f59e0b",
    distance: "11.7 km", eta: "22 min", risk: 46,
    roadType: "Mixed Urban", accidents: 7,
    riskLabel: "Moderate", weather: "Foggy",
  },
  risky: {
    label: "Downtown Direct", color: "#ef4444",
    distance: "9.4 km", eta: "18 min", risk: 78,
    roadType: "Inner City Core", accidents: 19,
    riskLabel: "High Risk", weather: "Congested",
  },
}

const AI_EXPLANATION =
  "Based on real-time traffic patterns, historical accident data for this corridor, current weather conditions (light morning fog, clearing by 09:15), and analysis of 847 similar route scenarios in the ML corpus — the Northern Bypass emerges as the optimal choice. Accident density is 87% lower than the direct route, with zero reported incidents in the past 6 hours. Confidence: 94.7%."

const SAFETY_TIPS = [
  "Reduce speed near Junction 4B — active fog advisory until 09:15",
  "School zone at km 6.2: heightened pedestrian activity 08–09 AM",
  "Construction zone: right lane closure at km 8.4, merge early",
  "Speed camera at km 11.2 — maintain posted 60 km/h limit",
]

const NOTIFICATIONS = [
  { id: 1, type: "warning", text: "Heavy congestion on Inner Ring Road — 40 min delay", time: "2 min ago" },
  { id: 2, type: "info",    text: "Weather update: light fog clearing by 09:15 AM",       time: "8 min ago" },
  { id: 3, type: "success", text: "Route recalculated — saving 12 minutes",                time: "15 min ago" },
  { id: 4, type: "danger",  text: "Accident reported: Sector 14 Bridge — avoid area",     time: "23 min ago" },
  { id: 5, type: "info",    text: "Road closure: NH-48 maintenance until 10 AM",           time: "1 hr ago" },
]

const PEAK_DATA = [
  { h: "6A", v: 4 }, { h: "7A", v: 12 }, { h: "8A", v: 28 }, { h: "9A", v: 19 },
  { h: "10A", v: 8 }, { h: "11A", v: 6 }, { h: "12P", v: 9 }, { h: "1P", v: 11 },
  { h: "2P", v: 7 }, { h: "3P", v: 10 }, { h: "4P", v: 17 }, { h: "5P", v: 31 },
  { h: "6P", v: 34 }, { h: "7P", v: 20 }, { h: "8P", v: 9 },
]

const TREND_DATA = [
  { m: "Jan", risk: 68, acc: 42 }, { m: "Feb", risk: 72, acc: 38 },
  { m: "Mar", risk: 61, acc: 51 }, { m: "Apr", risk: 55, acc: 35 },
  { m: "May", risk: 48, acc: 29 }, { m: "Jun", risk: 43, acc: 24 },
  { m: "Jul", risk: 52, acc: 33 },
]

const FEATURES = [
  { name: "Time of Day",      val: 92 }, { name: "Weather",         val: 85 },
  { name: "Road Type",        val: 78 }, { name: "Traffic Density", val: 74 },
  { name: "Accident History", val: 68 }, { name: "Construction",    val: 45 },
]

const SCENARIOS = [
  { icon: "🌧️", label: "Heavy Rain",        delta: +34, desc: "Risk +34% — safe route still optimal but ETA +8 min. Watch for aquaplaning on arterial." },
  { icon: "🌙", label: "Travel at 11 PM",   delta: -22, desc: "Risk −22% — lower traffic but reduced lighting on bypass. Keep high-beams ready." },
  { icon: "🚫", label: "Avoid Highways",    delta: +18, desc: "Risk +18% — urban roads with higher pedestrian density and more intersections." },
  { icon: "⏰", label: "Rush Hour (8 AM)",  delta: +47, desc: "Risk +47% — consider a 30-min delay for optimal safety and 18-min time saving." },
  { icon: "🌫️", label: "Dense Fog",         delta: +29, desc: "Risk +29% — reduce speed by 20 km/h; follow route guidance closely for best safety." },
  { icon: "📅", label: "Weekend Travel",    delta: -41, desc: "Risk −41% — significantly fewer vehicles; excellent conditions for this corridor." },
]

const AI_QUICK_Q = [
  "Why is the safe route best?",
  "What if it rains heavily?",
  "Best time to travel?",
  "Any alternative routes?",
]

const AI_RESPONSES: Record<string, string> = {
  "Why is the safe route best?":
    "The Northern Bypass scores lowest because it has 87% fewer historical accidents, avoids the congested downtown core, offers wider dual-carriageway lanes with better visibility, and current traffic density is only 23% — well below the risky 65% threshold.",
  "What if it rains heavily?":
    "In heavy rain, all route risks rise sharply: Safe → 34, Moderate → 68, Risky → 91. Still recommend the Safe route — but reduce speed by 20 km/h and maintain extra following distance near Junction 4B where standing water is common.",
  "Best time to travel?":
    "Optimal windows are 10 AM–12 PM or 2–3:30 PM on weekdays. Saturday mornings (pre-10 AM) offer the best overall conditions. Avoid 7–9 AM and 5–7 PM peak windows for this corridor — risk scores spike by 47% and 38% respectively.",
  "Any alternative routes?":
    "Two solid alternatives: (1) Eastern Expressway — adds 6 km but risk score of just 8, fastest right now. (2) Lake Road Bypass — scenic, low traffic, risk 15. Both are viable if you can spare 8–10 extra minutes.",
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

// ─── SVG Map ────────────────────────────────────────────────────────────────
function SVGMap({ sel, setSel, ready, isDark }: {
  sel: RouteKey; setSel: (k: RouteKey) => void; ready: boolean; isDark: boolean
}) {
  const st = isDark
  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ minHeight: 420 }}>
      <svg viewBox="0 0 800 480" className="w-full h-full"
        style={{ background: st ? "#080d1c" : "#dde6f4" }}>

        {/* Street grid */}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 38} x2="800" y2={i * 38}
            stroke={st ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.055)"} strokeWidth="0.6" />
        ))}
        {Array.from({ length: 22 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 37} y1="0" x2={i * 37} y2="480"
            stroke={st ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.055)"} strokeWidth="0.6" />
        ))}

        {/* Arterials */}
        <line x1="0" y1="190" x2="800" y2="190" stroke={st ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.14)"} strokeWidth="2.5" />
        <line x1="0" y1="330" x2="800" y2="330" stroke={st ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.14)"} strokeWidth="2.5" />
        <line x1="190" y1="0" x2="190" y2="480" stroke={st ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.14)"} strokeWidth="2.5" />
        <line x1="560" y1="0" x2="560" y2="480" stroke={st ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.14)"} strokeWidth="2.5" />
        <line x1="0" y1="480" x2="800" y2="0" stroke={st ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)"} strokeWidth="3" strokeDasharray="6 4" />

        {/* River */}
        <path d="M 295 0 C 315 70, 275 115, 308 195 C 328 255, 288 295, 318 375 L 358 375 C 328 295, 368 255, 348 195 C 318 115, 358 70, 338 0 Z"
          fill={st ? "rgba(29,78,216,0.25)" : "rgba(147,197,253,0.45)"} />

        {/* Park */}
        <rect x="405" y="275" width="98" height="78" rx="10"
          fill={st ? "rgba(16,85,36,0.28)" : "rgba(134,239,172,0.45)"} />
        <text x="454" y="320" textAnchor="middle" fontSize="9"
          fill={st ? "rgba(74,222,128,0.55)" : "rgba(22,163,74,0.7)"}>City Park</text>

        {/* City blocks */}
        {([
          [50,50,62,38],[140,65,45,55],[440,55,55,38],[625,75,58,42],
          [55,245,52,65],[450,175,72,42],[645,245,62,52],
          [58,355,82,58],[628,358,72,52],[220,245,55,42],[670,145,55,38]
        ] as number[][]).map(([x,y,w,h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="3"
            fill={st ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.065)"}
            stroke={st ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.1)"} strokeWidth="0.5" />
        ))}

        {/* Heatmap blobs */}
        {ready && <>
          <circle cx="405" cy="308" r="42" fill="rgba(239,68,68,0.11)" />
          <circle cx="455" cy="225" r="32" fill="rgba(245,158,11,0.09)" />
          <circle cx="558" cy="348" r="28" fill="rgba(239,68,68,0.13)" />
          <circle cx="248" cy="152" r="38" fill="rgba(245,158,11,0.07)" />
          <circle cx="640" cy="272" r="22" fill="rgba(239,68,68,0.10)" />
        </>}

        {/* Risky route */}
        {ready && (
          <g onClick={() => setSel("risky")} style={{ cursor: "pointer" }}>
            <path
              d="M 108 402 C 200 402, 315 380, 395 342 C 475 304, 565 258, 628 195 C 658 168, 672 152, 692 132"
              fill="none" stroke={sel === "risky" ? "#ef4444" : "rgba(239,68,68,0.45)"}
              strokeWidth={sel === "risky" ? 5.5 : 3}
              strokeLinecap="round" className="route-draw"
              style={{ animationDelay: "0.45s", filter: sel === "risky" ? "drop-shadow(0 0 10px #ef4444)" : "none" }}
            />
          </g>
        )}

        {/* Moderate route */}
        {ready && (
          <g onClick={() => setSel("moderate")} style={{ cursor: "pointer" }}>
            <path
              d="M 108 402 C 160 368, 235 336, 315 302 C 395 268, 478 238, 556 210 C 608 192, 655 162, 692 132"
              fill="none" stroke={sel === "moderate" ? "#f59e0b" : "rgba(245,158,11,0.45)"}
              strokeWidth={sel === "moderate" ? 5.5 : 3}
              strokeLinecap="round" className="route-draw"
              style={{ animationDelay: "0.22s", filter: sel === "moderate" ? "drop-shadow(0 0 10px #f59e0b)" : "none" }}
            />
          </g>
        )}

        {/* Safe route */}
        {ready && (
          <g onClick={() => setSel("safe")} style={{ cursor: "pointer" }}>
            <path
              d="M 108 402 C 128 338, 192 298, 262 258 C 332 218, 394 174, 462 152 C 532 132, 614 128, 692 132"
              fill="none" stroke={sel === "safe" ? "#22c55e" : "rgba(34,197,94,0.45)"}
              strokeWidth={sel === "safe" ? 5.5 : 3}
              strokeLinecap="round" className="route-draw"
              style={{ animationDelay: "0s", filter: sel === "safe" ? "drop-shadow(0 0 10px #22c55e)" : "none" }}
            />
          </g>
        )}

        {/* Origin marker */}
        {ready && <>
          <circle cx="108" cy="402" r="16" fill="rgba(59,130,246,0.25)" className="route-pulse" />
          <circle cx="108" cy="402" r="9" fill="#3b82f6" />
          <circle cx="108" cy="402" r="3.5" fill="white" />
          <text x="108" y="428" textAnchor="middle" fontSize="9" fontWeight="600"
            fill={st ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)"}>Origin</text>
        </>}

        {/* Destination marker */}
        {ready && <>
          <circle cx="692" cy="132" r="16" fill="rgba(99,102,241,0.25)" className="route-pulse" />
          <circle cx="692" cy="132" r="9" fill="#6366f1" />
          <circle cx="692" cy="132" r="3.5" fill="white" />
          <text x="692" y="114" textAnchor="middle" fontSize="9" fontWeight="600"
            fill={st ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)"}>Destination</text>
        </>}

        {/* Accident pins */}
        {ready && ([
          { x: 405, y: 318, hi: true }, { x: 558, y: 228, hi: false }, { x: 465, y: 375, hi: true }
        ]).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="6.5"
              fill={p.hi ? "rgba(239,68,68,0.92)" : "rgba(245,158,11,0.92)"}
              stroke="white" strokeWidth="1.5" />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fill="white" fontSize="7" fontWeight="700">!</text>
          </g>
        ))}

        {/* Route labels */}
        {ready && <>
          <text x="268" y="235" fill="rgba(34,197,94,0.85)" fontSize="9.5" fontWeight="700">Safe Route</text>
          <text x="318" y="292" fill="rgba(245,158,11,0.85)" fontSize="9.5" fontWeight="700">Moderate</text>
          <text x="388" y="362" fill="rgba(239,68,68,0.85)" fontSize="9.5" fontWeight="700">High Risk</text>
        </>}

        {/* Road labels */}
        <text x="240" y="16" fill={st ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)"} fontSize="8.5">Outer Ring Road</text>
        <text x="575" y="16" fill={st ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)"} fontSize="8.5">NH-48</text>
        <text x="8" y="186" fill={st ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)"} fontSize="8.5">MG Road</text>
      </svg>

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl"
          style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(2px)" }}>
          <Map className="w-12 h-12 mb-3 opacity-30" style={{ color: "var(--txt-muted)" }} />
          <p className="text-sm" style={{ color: "var(--txt-muted)" }}>Enter route details and click Analyze</p>
        </div>
      )}
    </div>
  )
}

// ─── AI Panel ───────────────────────────────────────────────────────────────
function AIPanel({ sel, ready, onClose }: {
  sel: RouteKey; ready: boolean; onClose: () => void
}) {
  const r = ROUTES[sel]
  const explanation = useTypingEffect(AI_EXPLANATION, 18, ready)

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
        {!ready ? (
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
                <Chip color={r.risk < 33 ? "green" : r.risk < 66 ? "amber" : "red"}>{r.riskLabel}</Chip>
              </div>
              <div className="flex items-center gap-3">
                <RiskGauge value={r.risk} />
                <div className="flex-1 space-y-2">
                  {(["safe", "moderate", "risky"] as RouteKey[]).map(k => (
                    <div key={k}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span style={{ color: "var(--txt-muted)" }}>{ROUTES[k].label}</span>
                        <span style={{ color: ROUTES[k].color }} className="font-semibold mono">{ROUTES[k].risk}</span>
                      </div>
                      <Bar2 value={ROUTES[k].risk} color={k === "safe" ? "green" : k === "moderate" ? "amber" : "red"} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Best Route */}
            <div className="p-3 rounded-xl"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)" }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide">Recommended</span>
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--txt-primary)" }}>Northern Bypass (Safe Route)</p>
              <p className="text-[10px] mt-0.5 mono" style={{ color: "var(--txt-muted)" }}>14.2 km · 28 min · Risk 12/100</p>
            </div>

            {/* AI Explanation */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Brain className="w-4 h-4 text-purple-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--txt-muted)" }}>AI Explanation</p>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--txt-secondary)" }}>
                {explanation}
                {explanation.length < AI_EXPLANATION.length && (
                  <span className="cursor-blink inline-block w-0.5 h-3 bg-blue-400 ml-0.5 align-middle rounded-full" />
                )}
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "ETA",       val: r.eta,                 color: "text-blue-400" },
                { label: "Distance",  val: r.distance,            color: "text-purple-400" },
                { label: "Weather",   val: r.weather,             color: "text-sky-400" },
                { label: "Incidents", val: `${r.accidents} near`, color: "text-amber-400" },
              ].map(({ label, val, color }) => (
                <div key={label} className="p-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: "var(--txt-muted)" }}>{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{val}</p>
                </div>
              ))}
            </div>

            {/* Confidence */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--txt-muted)" }}>Model Confidence</p>
                <span className="text-sm font-bold text-blue-400 mono">94.7%</span>
              </div>
              <Bar2 value={94.7} color="blue" />
              <p className="text-[10px] mt-1" style={{ color: "var(--txt-muted)" }}>Trained on 2.4M route scenarios · XGBoost + LSTM</p>
            </div>

            {/* Accident density */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--txt-muted)" }}>Accident Density</p>
              <div className="space-y-2">
                {[
                  { zone: "Sector 14 Bridge", v: 82, c: "red" },
                  { zone: "MG Road Junction", v: 54, c: "amber" },
                  { zone: "Northern Bypass",  v: 12, c: "green" },
                ].map(({ zone, v, c }) => (
                  <div key={zone}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span style={{ color: "var(--txt-muted)" }}>{zone}</span>
                      <span className="mono font-semibold"
                        style={{ color: c === "red" ? "#ef4444" : c === "amber" ? "#f59e0b" : "#22c55e" }}>{v}</span>
                    </div>
                    <Bar2 value={v} color={c} />
                  </div>
                ))}
              </div>
            </div>

            {/* Safety tips */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--txt-muted)" }}>Safety Alerts</p>
              </div>
              <ul className="space-y-2">
                {SAFETY_TIPS.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]" style={{ color: "var(--txt-secondary)" }}>
                    <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-amber-400/15 text-amber-400 text-[9px] flex items-center justify-center font-bold">{i + 1}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Route Comparison ───────────────────────────────────────────────────────
function RouteComparisonCard({ sel, ready }: { sel: RouteKey; ready: boolean }) {
  if (!ready) return (
    <div className="space-y-2.5">
      {[1, 2, 3].map(i => <Sk key={i} h={58} r={14} />)}
    </div>
  )
  return (
    <div className="space-y-2.5">
      {(["safe", "moderate", "risky"] as RouteKey[]).map((k, idx) => {
        const r = ROUTES[k]
        const active = sel === k
        return (
          <motion.div key={k}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="flex items-center gap-3 p-3 rounded-xl transition-all"
            style={{
              background: active ? `${r.color}12` : "rgba(255,255,255,0.03)",
              border: `1px solid ${active ? r.color + "38" : "rgba(255,255,255,0.06)"}`,
            }}>
            <div className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: r.color, boxShadow: `0 0 8px ${r.color}80` }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold" style={{ color: "var(--txt-primary)" }}>{r.label}</span>
                <Chip color={k === "safe" ? "green" : k === "moderate" ? "amber" : "red"}>{r.riskLabel}</Chip>
              </div>
              <p className="text-[10px] mono" style={{ color: "var(--txt-muted)" }}>
                {r.distance} · {r.eta} · {r.roadType}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-extrabold mono" style={{ color: r.color }}>{r.risk}</div>
              <div className="text-[9px]" style={{ color: "var(--txt-muted)" }}>/ 100</div>
            </div>
          </motion.div>
        )
      })}
      <div className="pt-2 grid grid-cols-3 gap-2">
        {[
          { label: "Accidents (7d)", vals: ["2", "7", "19"] },
          { label: "Weather",         vals: ["Clear", "Foggy", "Congested"] },
          { label: "Road Quality",    vals: ["A+", "B", "C+"] },
        ].map(({ label, vals }) => (
          <div key={label} className="text-center">
            <p className="text-[9px] mb-1.5 uppercase tracking-wide" style={{ color: "var(--txt-muted)" }}>{label}</p>
            <div className="space-y-1">
              {vals.map((v, i) => (
                <div key={i} className="text-[10px] font-semibold mono"
                  style={{ color: i === 0 ? "#22c55e" : i === 1 ? "#f59e0b" : "#ef4444" }}>{v}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ML Prediction ──────────────────────────────────────────────────────────
function MLPredictionCard({ ready }: { ready: boolean }) {
  if (!ready) return (
    <div className="space-y-3">
      <div className="flex justify-center"><Sk w={116} h={76} r={12} /></div>
      {[1, 2, 3, 4, 5].map(i => <Sk key={i} h={20} />)}
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--txt-muted)" }}>ML Risk Score — Safe Route</p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold mono text-green-400">12</span>
            <span className="text-sm" style={{ color: "var(--txt-muted)" }}>/ 100</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Chip color="blue">XGBoost</Chip>
            <Chip color="purple">93.2% acc</Chip>
          </div>
        </div>
        <RiskGauge value={12} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--txt-muted)" }}>Feature Importance</p>
        <div className="space-y-2.5">
          {FEATURES.map(({ name, val }) => (
            <div key={name}>
              <div className="flex justify-between text-[10px] mb-1">
                <span style={{ color: "var(--txt-secondary)" }}>{name}</span>
                <span className="mono text-blue-400 font-semibold">{val}%</span>
              </div>
              <Bar2 value={val} color="blue" />
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 rounded-xl text-[10px] leading-relaxed" style={{
        background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)",
        color: "var(--txt-muted)",
      }}>
        Ensemble: XGBoost (70%) + Random Forest (20%) + Logistic Regression (10%)
        · SHAP values computed on 128 features · Retrained weekly
      </div>
    </div>
  )
}

// ─── Deep Learning ──────────────────────────────────────────────────────────
function DeepLearningCard() {
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const runAnalysis = () => {
    if (analyzing) return
    setResult(null)
    setAnalyzing(true)
    setTimeout(() => {
      setAnalyzing(false)
      setResult("Road: Wet asphalt · Visibility: Reduced (fog, ~180m) · Hazards: Standing water lane 2, debris near shoulder · Risk Score: 67/100 · Confidence: 88%")
    }, 2600)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-indigo-400" />
        <span className="text-[10px] font-medium" style={{ color: "var(--txt-muted)" }}>
          Road Image Analysis · ResNet-50 · 1.2M training images
        </span>
      </div>

      <div
        onClick={runAnalysis}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); runAnalysis() }}
        className="relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer select-none"
        style={{
          borderColor: dragging ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.1)",
          background: dragging ? "rgba(99,102,241,0.08)" : "transparent",
          minHeight: 120,
        }}>
        {analyzing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent spinner" />
            <p className="text-xs text-indigo-400 font-medium">Analyzing road image…</p>
            <div className="w-48">
              <Bar2 value={72} color="purple" />
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mb-2.5" style={{ color: "var(--txt-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--txt-secondary)" }}>
              Drop road image or click
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--txt-muted)" }}>JPG, PNG · Max 10 MB</p>
          </>
        )}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl text-[11px] leading-relaxed"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "var(--txt-secondary)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-bold text-indigo-400 text-[10px] uppercase tracking-wide">CNN Analysis</span>
            </div>
            {result}
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !analyzing && (
        <p className="text-[10px] text-center" style={{ color: "var(--txt-muted)" }}>
          Demo: click the drop zone to simulate analysis
        </p>
      )}
    </div>
  )
}

// ─── GenAI Chat ─────────────────────────────────────────────────────────────
function GenAIChatCard() {
  const [msgs, setMsgs] = useState([{
    role: "ai",
    text: "Hello! I'm your AI Traffic Assistant. I've analyzed your route and ready to answer questions about road safety, conditions, or route optimization."
  }])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const send = (text: string) => {
    if (!text.trim() || typing) return
    setMsgs(p => [...p, { role: "user", text }])
    setInput("")
    setTyping(true)
    setTimeout(() => {
      const reply = AI_RESPONSES[text] ??
        "Based on current ML analysis, the Safe Route remains optimal for your journey. Ask me anything more specific about conditions, timing, or alternatives!"
      setMsgs(p => [...p, { role: "ai", text: reply }])
      setTyping(false)
    }, 1000 + Math.random() * 900)
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, typing])

  return (
    <div className="flex flex-col" style={{ height: 360 }}>
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-0.5" style={{ scrollbarWidth: "none" }}>
        {msgs.map((m, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
              m.role === "ai" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
            }`}>{m.role === "ai" ? "AI" : "You"}</div>
            <div className={`px-3 py-2 rounded-2xl text-[11px] leading-relaxed max-w-[82%] ${m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
              style={{
                background: m.role === "user" ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${m.role === "user" ? "rgba(99,102,241,0.28)" : "rgba(255,255,255,0.07)"}`,
                color: "var(--txt-secondary)",
              }}>
              {m.text}
            </div>
          </motion.div>
        ))}
        {typing && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-400 flex-shrink-0">AI</div>
            <div className="px-3 py-2 rounded-2xl rounded-tl-sm"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.14}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {AI_QUICK_Q.map(q => (
          <button key={q} onClick={() => send(q)}
            className="text-[10px] px-2 py-1 rounded-full transition-all hover:scale-105 active:scale-95"
            style={{ background: "rgba(59,130,246,0.09)", border: "1px solid rgba(59,130,246,0.2)", color: "var(--txt-muted)" }}>
            {q}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send(input)}
          placeholder="Ask about your route…"
          className="flex-1 px-3 py-2 rounded-xl text-[11px] outline-none transition-all"
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--txt-primary)",
          }}
        />
        <button onClick={() => send(input)}
          className="p-2 rounded-xl bg-blue-500 hover:bg-blue-400 transition-colors active:scale-95">
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  )
}

// ─── Scenario Simulator ──────────────────────────────────────────────────────
function ScenarioCard({ ready }: { ready: boolean }) {
  const [active, setActive] = useState<number | null>(null)
  return (
    <div className="space-y-3">
      {!ready && (
        <div className="text-xs text-center py-3" style={{ color: "var(--txt-muted)" }}>
          Analyze a route to unlock scenario simulation
        </div>
      )}
      <p className="text-[10px]" style={{ color: "var(--txt-muted)" }}>
        {ready ? "Tap a scenario to simulate impact on route risk" : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SCENARIOS.map((s, i) => {
          const on = active === i
          const pos = s.delta < 0
          return (
            <motion.button key={i}
              whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.97 }}
              onClick={() => setActive(on ? null : i)}
              disabled={!ready}
              className="p-3 rounded-xl text-left transition-all disabled:opacity-30"
              style={{
                background: on ? (pos ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)") : "rgba(255,255,255,0.04)",
                border: `1px solid ${on ? (pos ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)") : "rgba(255,255,255,0.07)"}`,
              }}>
              <div className="text-xl mb-1">{s.icon}</div>
              <p className="text-xs font-semibold" style={{ color: "var(--txt-primary)" }}>{s.label}</p>
              <AnimatePresence>
                {on && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <p className="text-[10px] mt-1 leading-relaxed" style={{ color: "var(--txt-muted)" }}>{s.desc}</p>
                    <p className={`mt-1.5 text-xs font-bold mono ${pos ? "text-green-400" : "text-red-400"}`}>
                      {pos ? "▼" : "▲"} Risk {Math.abs(s.delta)}%
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Analytics ───────────────────────────────────────────────────────────────
function AnalyticsCard() {
  const [tab, setTab] = useState<"peaks" | "trends">("peaks")
  const tt = {
    contentStyle: { background: "rgba(8,13,28,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 },
    labelStyle: { color: "rgba(255,255,255,0.6)" },
    itemStyle: { color: "#94a3b8" },
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[{ k: "peaks", l: "Peak Hours" }, { k: "trends", l: "Risk Trends" }].map(({ k, l }) => (
          <button key={k}
            onClick={() => setTab(k as "peaks" | "trends")}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${tab === k ? "bg-blue-500/18 text-blue-400 border border-blue-500/28" : "hover:bg-white/6"}`}
            style={{ color: tab === k ? undefined : "var(--txt-muted)", border: tab === k ? undefined : "1px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "peaks" ? (
        <>
          <p className="text-[10px]" style={{ color: "var(--txt-muted)" }}>Accident frequency by hour · 30-day rolling average</p>
          <ResponsiveContainer width="100%" height={175}>
            <BarChart data={PEAK_DATA} barSize={13} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="h" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.28)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "rgba(255,255,255,0.28)" }} tickLine={false} axisLine={false} />
              <Tooltip {...tt} />
              <Bar dataKey="v" radius={[4, 4, 0, 0]} name="Accidents">
                {PEAK_DATA.map((d, i) => (
                  <Cell key={`peak-${i}`} fill={d.v > 20 ? "#ef4444" : d.v > 12 ? "#f59e0b" : "#3b82f6"} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center">
            {[["#ef4444", "High (>20)"], ["#f59e0b", "Medium (12–20)"], ["#3b82f6", "Low (<12)"]].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                <span className="text-[9px]" style={{ color: "var(--txt-muted)" }}>{l}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px]" style={{ color: "var(--txt-muted)" }}>Monthly risk score and accident count trends</p>
          <ResponsiveContainer width="100%" height={175}>
            <AreaChart data={TREND_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.28)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8, fill: "rgba(255,255,255,0.28)" }} tickLine={false} axisLine={false} />
              <Tooltip {...tt} />
              <Area type="monotone" dataKey="risk" name="Risk Score" stroke="#3b82f6" fill="url(#gR)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="acc"  name="Accidents"  stroke="#22c55e" fill="url(#gA)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center">
            {[["#3b82f6", "Risk Score"], ["#22c55e", "Accidents"]].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 rounded-full" style={{ background: c }} />
                <span className="text-[9px]" style={{ color: "var(--txt-muted)" }}>{l}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Notification Drawer ────────────────────────────────────────────────────
function NotifDrawer({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  const cfg: Record<string, string> = {
    warning: "text-amber-400 bg-amber-400/10 border-amber-400/15",
    info:    "text-blue-400 bg-blue-400/10 border-blue-400/15",
    success: "text-green-400 bg-green-400/10 border-green-400/15",
    danger:  "text-red-400 bg-red-400/10 border-red-400/15",
  }
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={onClose} />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed right-0 top-0 h-full w-80 z-50 flex flex-col"
            style={{
              background: isDark ? "rgba(8,13,28,0.97)" : "rgba(255,255,255,0.97)",
              backdropFilter: "blur(20px)",
              borderLeft: "1px solid var(--glass-border)",
            }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--glass-border)" }}>
              <div>
                <h3 className="font-semibold exo" style={{ color: "var(--txt-primary)" }}>Notifications</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--txt-muted)" }}>{NOTIFICATIONS.length} active alerts</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors" style={{ color: "var(--txt-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5" style={{ scrollbarWidth: "none" }}>
              {NOTIFICATIONS.map(n => (
                <motion.div key={n.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-xl border ${cfg[n.type]}`}>
                  <p className="text-xs font-medium">{n.text}</p>
                  <p className="text-[10px] mt-1 opacity-60">{n.time}</p>
                </motion.div>
              ))}
            </div>
            <div className="p-4 border-t" style={{ borderColor: "var(--glass-border)" }}>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
                Mark all as read
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
  const [notif,  setNotif]  = useState(false)
  const [voice,  setVoice]  = useState(false)
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
      setSel("safe")
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

  const cards = [
    { id: "cmp", title: "Route Comparison",     Icon: Route,        accent: "#3b82f6", content: <RouteComparisonCard sel={sel} ready={ready} /> },
    { id: "ml",  title: "ML Prediction",         Icon: Brain,        accent: "#8b5cf6", content: <MLPredictionCard ready={ready} /> },
    { id: "sc",  title: "Scenario Simulator",   Icon: Zap,          accent: "#f59e0b", content: <ScenarioCard ready={ready} /> },
    { id: "an",  title: "Analytics",             Icon: BarChart2,    accent: "#22c55e", content: <AnalyticsCard /> },
    { id: "rd",  title: "Route Details",         Icon: Map,          accent: "#06b6d4", content: <RouteDetailsCard route={selectedRoute} ready={ready} source={source} destination={dest} sourceCoords={sourceCoords} destCoords={destCoords} /> },
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
      <NotifDrawer open={notif} onClose={() => setNotif(false)} isDark={isDark} />

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
                          <div className="w-5 h-1.5 rounded-full" style={{ background: ROUTES[k].color }} />
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
                  <AIPanel sel={sel} ready={ready} onClose={() => setAIOpen(false)} />
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
