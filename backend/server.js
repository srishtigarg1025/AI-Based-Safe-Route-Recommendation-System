import express from "express"
import cors from "cors"

const app = express()
app.use(cors())
app.use(express.json())

const NOMINATIM = "https://nominatim.openstreetmap.org"
const OSRM = "https://routing.openstreetmap.de"

async function geocode(place) {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(place)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: { "User-Agent": "SafeRouteApp/1.0" },
  })
  const data = await res.json()
  if (!data || data.length === 0) {
    throw new Error(`Could not geocode: ${place}`)
  }
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)]
}

function classifyRoad(name, distance, duration) {
  const speed = duration > 0 ? (distance / 1000) / (duration / 3600) : 0
  const upper = name.toUpperCase()
  if (upper.startsWith("NH") || upper.includes("EXPRESSWAY") || upper.includes("FREEWAY") || upper.includes("MOTORWAY")) return "Highway"
  if (upper.startsWith("SH") || upper.includes("BYPASS") || upper.includes("RING ROAD")) return "Arterial"
  if (name.includes("Flyover") || name.includes("Bridge")) return "Flyover"
  if (speed > 50) return "Arterial"
  if (speed > 30) return "Collector"
  return "Local"
}

function estimateLanes(name) {
  const upper = name.toUpperCase()
  if (upper.startsWith("NH") || upper.includes("EXPRESSWAY") || upper.includes("FREEWAY")) return 4
  if (upper.startsWith("SH") || upper.includes("BYPASS") || upper.includes("RING ROAD")) return 3
  if (name.includes("Flyover") || name.includes("Bridge")) return 3
  return 2
}

function wmoToCondition(code) {
  if (code === 0) return { label: "Clear", icon: "clear" }
  if (code <= 3) return { label: "Partly Cloudy", icon: "cloudy" }
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog" }
  if (code >= 51 && code <= 55) return { label: "Drizzle", icon: "rain" }
  if (code >= 61 && code <= 65) return { label: "Rain", icon: "rain" }
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "snow" }
  if (code >= 80 && code <= 82) return { label: "Rain Showers", icon: "rain" }
  if (code >= 95 && code <= 99) return { label: "Thunderstorm", icon: "storm" }
  return { label: "Unknown", icon: "clear" }
}

async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index&timezone=auto`
  const res = await fetch(url)
  const data = await res.json()
  if (!data || !data.current) return null
  const cond = wmoToCondition(data.current.weather_code)
  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    windSpeed: data.current.wind_speed_10m,
    uvIndex: data.current.uv_index,
    condition: cond.label,
    icon: cond.icon,
    weatherCode: data.current.weather_code,
  }
}

function avgWeather(weathers) {
  const valid = weathers.filter(Boolean)
  if (valid.length === 0) return null
  const unique = (arr) => [...new Set(arr)]
  return {
    temperature: Math.round(valid.reduce((s, w) => s + w.temperature, 0) / valid.length * 10) / 10,
    feelsLike: Math.round(valid.reduce((s, w) => s + w.feelsLike, 0) / valid.length * 10) / 10,
    humidity: Math.round(valid.reduce((s, w) => s + w.humidity, 0) / valid.length),
    precipitation: Math.round(valid.reduce((s, w) => s + w.precipitation, 0) / valid.length * 10) / 10,
    windSpeed: Math.round(valid.reduce((s, w) => s + w.windSpeed, 0) / valid.length * 10) / 10,
    condition: unique(valid.map(w => w.condition)).join("/"),
    icon: unique(valid.map(w => w.icon)).join("/"),
  }
}

const ROUTE_KEYS = ["safe", "moderate", "risky"]
const ROUTE_NAMES = ["Route 1", "Route 2", "Route 3"]

app.post("/api/routes", async (req, res) => {
  try {
    const { source, destination } = req.body
    if (!source || !destination) {
      return res.status(400).json({ error: "source and destination required" })
    }

    const srcCoords = await geocode(source)
    const dstCoords = await geocode(destination)

    const url = `${OSRM}/routed-car/route/v1/driving/${srcCoords[0]},${srcCoords[1]};${dstCoords[0]},${dstCoords[1]}?alternatives=true&overview=full&geometries=geojson&steps=true`
    const osrmRes = await fetch(url)
    const osrmData = await osrmRes.json()

    if (!osrmData || !osrmData.routes || osrmData.routes.length === 0) {
      return res.status(404).json({ error: "No routes found" })
    }

    const routeResults = osrmData.routes.slice(0, 3).map((route, i) => {
      const distKm = (route.distance / 1000).toFixed(1)
      const durMin = Math.round(route.duration / 60)

      const allSteps = route.legs.flatMap(leg => leg.steps || [])
      const uniqueRoads = new Map()
      for (const step of allSteps) {
        if (!step.name) continue
        const existing = uniqueRoads.get(step.name)
        if (existing) {
          existing.distance += step.distance
          existing.duration += step.duration
        } else {
          uniqueRoads.set(step.name, {
            road: step.name,
            distance: step.distance,
            duration: step.duration,
            type: classifyRoad(step.name, step.distance, step.duration),
            lanes: estimateLanes(step.name),
          })
        }
      }

      const roadSegments = [...uniqueRoads.values()]
        .sort((a, b) => b.distance - a.distance)
        .map(s => ({
          ...s,
          distance: `${(s.distance / 1000).toFixed(1)} km`,
        }))

      const trafficSignals = Math.max(allSteps.length - 1, 0)

      return {
        key: ROUTE_KEYS[i] || "safe",
        label: `${distKm} km · ${durMin} min`,
        distance: `${distKm} km`,
        duration: `${durMin} min`,
        coords: route.geometry.coordinates,
        details: {
          roadSegments,
          trafficSignals,
          totalSteps: allSteps.length,
        },
      }
    })

    let weather = null
    try {
      const [srcW, dstW] = await Promise.all([
        getWeather(srcCoords[1], srcCoords[0]),
        getWeather(dstCoords[1], dstCoords[0]),
      ])
      const midLat = (srcCoords[1] + dstCoords[1]) / 2
      const midLon = (srcCoords[0] + dstCoords[0]) / 2
      const midW = await getWeather(midLat, midLon)
      const pathW = avgWeather([srcW, midW, dstW].filter(Boolean))
      weather = { source: srcW, destination: dstW, path: pathW }
    } catch (_) {
      console.warn("Weather fetch failed, continuing without weather data")
    }

    res.json({
      sourceCoords: srcCoords,
      destCoords: dstCoords,
      routes: routeResults,
      weather,
    })
  } catch (err) {
    console.error("Routing error:", err)
    res.status(500).json({ error: err.message || "Internal error" })
  }
})

app.get("/api/weather", async (req, res) => {
  try {
    const { lat, lon } = req.query
    if (!lat || !lon) return res.status(400).json({ error: "lat and lon required" })
    const weather = await getWeather(parseFloat(lat), parseFloat(lon))
    if (!weather) return res.status(500).json({ error: "Weather fetch failed" })
    res.json(weather)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() })
})

app.get("/api/calendar", (_req, res) => {
  const now = new Date()
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const dayOfWeek = days[now.getDay()]
  const isWeekend = now.getDay() === 0 || now.getDay() === 6
  res.json({
    date: now.toISOString().slice(0, 10),
    dayOfWeek,
    isWeekend,
    dayOfYear: Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000),
    weekNumber: Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + now.getDay() + 1) / 7),
    timestamp: now.toISOString(),
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n  ✓ Backend running on http://localhost:${PORT}`)
  console.log(`  ✓ Health check: http://localhost:${PORT}/api/health`)
  console.log(`  ✓ Calendar API: GET http://localhost:${PORT}/api/calendar`)
  console.log(`  ✓ Route API:    POST http://localhost:${PORT}/api/routes\n`)
})
