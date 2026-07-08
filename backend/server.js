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

function decodePolyline(encoded, precision = 5) {
  if (!encoded) return []
  const factor = 10 ** precision
  let index = 0
  let lat = 0
  let lng = 0
  const coords = []
  while (index < encoded.length) {
    let byte = 0
    let shift = 0
    let result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1)
    lat += deltaLat
    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1)
    lng += deltaLng
    coords.push([lng / factor, lat / factor])
  }
  return coords
}

const ROUTE_KEYS = ["safe", "moderate", "risky"]
const ROUTE_LABELS = ["Northern Bypass", "Ring Road Connector", "Downtown Direct"]

app.post("/api/routes", async (req, res) => {
  try {
    const { source, destination } = req.body
    if (!source || !destination) {
      return res.status(400).json({ error: "source and destination required" })
    }

    const srcCoords = await geocode(source)
    const dstCoords = await geocode(destination)

    const url = `${OSRM}/routed-car/route/v1/driving/${srcCoords[0]},${srcCoords[1]};${dstCoords[0]},${dstCoords[1]}?alternatives=true&overview=full&geometries=geojson&steps=false`
    const osrmRes = await fetch(url)
    const osrmData = await osrmRes.json()

    if (!osrmData || !osrmData.routes || osrmData.routes.length === 0) {
      return res.status(404).json({ error: "No routes found" })
    }

    const routeResults = osrmData.routes.slice(0, 3).map((route, i) => {
      const distKm = (route.distance / 1000).toFixed(1)
      const durMin = Math.round(route.duration / 60)
      return {
        key: ROUTE_KEYS[i] || "safe",
        label: ROUTE_LABELS[i] || `Route ${i + 1}`,
        distance: `${distKm} km`,
        duration: `${durMin} min`,
        coords: route.geometry.coordinates,
      }
    })

    res.json({
      sourceCoords: srcCoords,
      destCoords: dstCoords,
      routes: routeResults,
    })
  } catch (err) {
    console.error("Routing error:", err)
    res.status(500).json({ error: err.message || "Internal error" })
  }
})

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n  ✓ Backend running on http://localhost:${PORT}`)
  console.log(`  ✓ Health check: http://localhost:${PORT}/api/health`)
  console.log(`  ✓ Route API:    POST http://localhost:${PORT}/api/routes\n`)
})
