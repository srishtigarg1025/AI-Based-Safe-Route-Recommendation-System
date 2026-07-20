import express from "express"
import cors from "cors"
import axios from "axios"
import dotenv from "dotenv"

dotenv.config()


// ==================================================
// CONFIG
// ==================================================

const ML_API = "http://localhost:8000"

const app = express()

app.use(cors())
app.use(express.json())


const NOMINATIM = "https://nominatim.openstreetmap.org"
const OSRM = "https://routing.openstreetmap.de"


// ==================================================
// GEOCODING
// ==================================================

async function geocode(place) {

  const url =
    `${NOMINATIM}/search?q=${encodeURIComponent(place)}` +
    `&format=json&limit=1`

  const res = await fetch(url, {
    headers: {
      "User-Agent": "SafeRouteApp/1.0",
    },
  })

  const data = await res.json()

  if (!data || data.length === 0) {
    throw new Error(`Could not geocode: ${place}`)
  }

  return [
    parseFloat(data[0].lon),
    parseFloat(data[0].lat),
  ]
}


// ==================================================
// ROAD CLASSIFICATION
// ==================================================

function classifyRoad(name, distance, duration) {

  const speed =
    duration > 0
      ? (distance / 1000) / (duration / 3600)
      : 0

  const upper = name.toUpperCase()


  if (
    upper.startsWith("NH") ||
    upper.includes("EXPRESSWAY") ||
    upper.includes("FREEWAY") ||
    upper.includes("MOTORWAY")
  ) {
    return "Highway"
  }


  if (
    upper.startsWith("SH") ||
    upper.includes("BYPASS") ||
    upper.includes("RING ROAD")
  ) {
    return "Arterial"
  }


  if (
    name.includes("Flyover") ||
    name.includes("Bridge")
  ) {
    return "Flyover"
  }


  if (speed > 50) return "Arterial"

  if (speed > 30) return "Collector"

  return "Local"
}


// ==================================================
// LANE ESTIMATION
// ==================================================

function estimateLanes(name) {

  const upper = name.toUpperCase()


  if (
    upper.startsWith("NH") ||
    upper.includes("EXPRESSWAY") ||
    upper.includes("FREEWAY")
  ) {
    return 4
  }


  if (
    upper.startsWith("SH") ||
    upper.includes("BYPASS") ||
    upper.includes("RING ROAD")
  ) {
    return 3
  }


  if (
    name.includes("Flyover") ||
    name.includes("Bridge")
  ) {
    return 3
  }


  return 2
}


// ==================================================
// WEATHER
// ==================================================

function wmoToCondition(code) {

  if (code === 0)
    return {
      label: "Clear",
      icon: "clear",
    }

  if (code <= 3)
    return {
      label: "Partly Cloudy",
      icon: "cloudy",
    }

  if (code === 45 || code === 48)
    return {
      label: "Fog",
      icon: "fog",
    }

  if (code >= 51 && code <= 55)
    return {
      label: "Drizzle",
      icon: "rain",
    }

  if (code >= 61 && code <= 65)
    return {
      label: "Rain",
      icon: "rain",
    }

  if (code >= 71 && code <= 77)
    return {
      label: "Snow",
      icon: "snow",
    }

  if (code >= 80 && code <= 82)
    return {
      label: "Rain Showers",
      icon: "rain",
    }

  if (code >= 95 && code <= 99)
    return {
      label: "Thunderstorm",
      icon: "storm",
    }

  return {
    label: "Unknown",
    icon: "clear",
  }
}


const weatherCache = new Map()


async function getWeather(lat, lon) {

  const key =
    `${lat.toFixed(2)},${lon.toFixed(2)}`


  if (weatherCache.has(key)) {
    return weatherCache.get(key)
  }


  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,` +
    `apparent_temperature,precipitation,weather_code,` +
    `wind_speed_10m,uv_index` +
    `&timezone=auto`


  try {

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(t)


    if (!res.ok) {

      console.warn(
        `WEATHER ${res.status} - using defaults`
      )

      const fallback = {
        temperature: 30,
        feelsLike: 32,
        humidity: 50,
        precipitation: 0,
        windSpeed: 10,
        uvIndex: 5,
        condition: "Clear",
        icon: "clear",
        weatherCode: 0,
      }

      weatherCache.set(key, fallback)

      return fallback
    }


    const data = await res.json()


    if (!data || !data.current) {

      console.warn(
        "Weather response missing current"
      )

      return null
    }


    const cond =
      wmoToCondition(
        data.current.weather_code
      )


    const result = {

      temperature:
        data.current.temperature_2m,

      feelsLike:
        data.current.apparent_temperature,

      humidity:
        data.current.relative_humidity_2m,

      precipitation:
        data.current.precipitation,

      windSpeed:
        data.current.wind_speed_10m,

      uvIndex:
        data.current.uv_index,

      condition:
        cond.label,

      icon:
        cond.icon,

      weatherCode:
        data.current.weather_code,
    }


    weatherCache.set(key, result)

    return result

  } catch (error) {

    console.warn(
      "WEATHER FETCH ERROR:",
      error.message
    )

    return null
  }
}


function avgWeather(weathers) {

  const valid =
    weathers.filter(Boolean)


  if (valid.length === 0) {
    return null
  }


  const unique =
    arr => [...new Set(arr)]


  return {

    temperature:
      Math.round(
        valid.reduce(
          (sum, w) => sum + w.temperature,
          0
        ) / valid.length * 10
      ) / 10,


    feelsLike:
      Math.round(
        valid.reduce(
          (sum, w) => sum + w.feelsLike,
          0
        ) / valid.length * 10
      ) / 10,


    humidity:
      Math.round(
        valid.reduce(
          (sum, w) => sum + w.humidity,
          0
        ) / valid.length
      ),


    precipitation:
      Math.round(
        valid.reduce(
          (sum, w) => sum + w.precipitation,
          0
        ) / valid.length * 10
      ) / 10,


    windSpeed:
      Math.round(
        valid.reduce(
          (sum, w) => sum + w.windSpeed,
          0
        ) / valid.length * 10
      ) / 10,


    condition:
      unique(
        valid.map(w => w.condition)
      ).join("/"),


    icon:
      unique(
        valid.map(w => w.icon)
      ).join("/"),
  }
}


// ==================================================
// MODEL MAPPINGS
// ==================================================

function mapRoadType(type) {

  const t =
    (type || "").toLowerCase()


  if (t === "highway") {
    return "highway"
  }


  if (
    [
      "arterial",
      "collector",
      "local",
    ].includes(t)
  ) {
    return "urban"
  }


  if (t === "flyover") {
    return "highway"
  }


  return "rural"
}


function mapWeather(condition) {

  const c =
    (condition || "").toLowerCase()


  if (c.includes("fog")) {
    return "fog"
  }


  if (
    c.includes("rain") ||
    c.includes("drizzle") ||
    c.includes("thunderstorm") ||
    c.includes("snow")
  ) {
    return "rain"
  }


  return "clear"
}


// ==================================================
// RISK WEIGHT FACTORS
// ==================================================

const ROAD_WEIGHT = {
  highway: 0.7,
  flyover: 0.75,
  rural: 0.85,
  arterial: 0.9,
  collector: 0.95,
  local: 1.0,
}

const SEVERITY_WEIGHT = {
  low: 1.0,
  medium: 2.0,
  high: 4.0,
}

const VISIBILITY_WEIGHT = {
  high: 1.0,
  medium: 1.5,
  low: 2.5,
}

const WEATHER_WEIGHT = {
  clear: 1.0,
  rain: 1.5,
  fog: 2.0,
}

function computeSegmentWeight(segment, hour) {
  const type = (segment.type || "").toLowerCase()
  const severity = (segment.severity || "low").toLowerCase()
  const segWeather = (segment.segWeather || "clear").toLowerCase()
  const segVisibility = (segment.segVisibility || "high").toLowerCase()

  const severityW = SEVERITY_WEIGHT[severity] || 1.0
  const hotspotW = 1 + (segment.segment_hotspot_count || 0) * 0.3
  const visibilityW = VISIBILITY_WEIGHT[segVisibility] || 1.0
  const weatherW = WEATHER_WEIGHT[segWeather] || 1.0
  const roadW = ROAD_WEIGHT[type] || 1.0
  const signalW = segment.trafficSignal ? 1.1 : 1.0
  const laneW = 1 + (segment.lanes || 2) * 0.02
  const timeW = (hour < 6 || hour > 20) ? 1.15 : 1.0

  return segment.distanceKm * severityW * hotspotW * visibilityW * weatherW * roadW * signalW * laneW * timeW
}


// ==================================================
// ROUTE API
// ==================================================

app.post("/api/routes", async (req, res) => {

  try {

    const {
      source,
      destination,
    } = req.body


    if (!source || !destination) {

      return res.status(400).json({
        error:
          "source and destination required",
      })
    }


    // ------------------------------------------
    // 1. Geocode
    // ------------------------------------------

    const srcCoords =
      await geocode(source)


    const dstCoords =
      await geocode(destination)


    // ------------------------------------------
    // 2. OSRM Routes
    // ------------------------------------------

    const url =
      `${OSRM}/routed-car/route/v1/driving/` +
      `${srcCoords[0]},${srcCoords[1]};` +
      `${dstCoords[0]},${dstCoords[1]}` +
      `?alternatives=true` +
      `&overview=full` +
      `&geometries=geojson` +
      `&steps=true`


    const osrmRes =
      await fetch(url)


    const osrmData =
      await osrmRes.json()


    if (
      !osrmData ||
      !osrmData.routes ||
      osrmData.routes.length === 0
    ) {

      return res.status(404).json({
        error: "No routes found",
      })
    }


    // ------------------------------------------
    // 3. Build route segments
    // ------------------------------------------

    const routeResults =
      osrmData.routes
        .slice(0, 3)
        .map((route) => {


          const distKm =
            (route.distance / 1000)
              .toFixed(1)


          const durMin =
            Math.round(
              route.duration / 60
            )


          const allSteps =
            route.legs.flatMap(
              leg => leg.steps || []
            )


          const roadSegments =
            allSteps.map(
              (step, index) => {


                const road =
                  step.name ||
                  "Unnamed Road"


                const type =
                  classifyRoad(
                    road,
                    step.distance,
                    step.duration
                  )


                const trafficSignal =
                  step.intersections?.some(
                    intersection =>
                      intersection.classes?.includes(
                        "traffic_signals"
                      )
                  )
                    ? 1
                    : 0


                return {

                  segmentIndex:
                    index,

                  road,

                  distance:
                    `${(
                      step.distance / 1000
                    ).toFixed(1)} km`,

                  distanceKm:
                    parseFloat(
                      (
                        step.distance / 1000
                      ).toFixed(1)
                    ),

                  type,

                  lanes:
                    estimateLanes(road),

                  trafficSignal,

                  coords:
                    step.geometry?.coordinates ||
                    [],
                }
              }
            )
            .filter(
              segment =>
                segment.distanceKm > 0 &&
                segment.coords.length >= 2
            )


          const trafficSignals =
            roadSegments.reduce(
              (sum, segment) =>
                sum + segment.trafficSignal,
              0
            )


          return {

            label:
              `${distKm} km · ${durMin} min`,

            distance:
              `${distKm} km`,

            distanceKm:
              parseFloat(distKm),

            duration:
              `${durMin} min`,

            durationMin:
              durMin,

            coords:
              route.geometry.coordinates,

            details: {

              roadSegments,

              trafficSignals,

              totalSteps:
                allSteps.length,
            },
          }
        })


    // ------------------------------------------
    // 4. Weather
    // ------------------------------------------

    let weather = null


    try {

      const [
        srcW,
        dstW,
      ] = await Promise.all([

        getWeather(
          srcCoords[1],
          srcCoords[0]
        ),

        getWeather(
          dstCoords[1],
          dstCoords[0]
        ),
      ])


      const midLat =
        (srcCoords[1] + dstCoords[1]) / 2


      const midLon =
        (srcCoords[0] + dstCoords[0]) / 2


      const midW =
        await getWeather(
          midLat,
          midLon
        )


      const pathW =
        avgWeather([
          srcW,
          midW,
          dstW,
        ])


      weather = {

        source: srcW,

        destination: dstW,

        path: pathW,
      }

    } catch (error) {

      console.error(
        "WEATHER FAILED:",
        error
      )
    }


    // ------------------------------------------
    // 5. Common ML Features
    // ------------------------------------------

    const now =
      new Date()


    const hour =
      now.getHours()


    const days = [

      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",

    ]


    const dayOfWeek =
      days[now.getDay()]


    const isWeekend =
      now.getDay() === 0 ||
      now.getDay() === 6
        ? 1
        : 0


    const isPeakHour =
      (
        hour >= 8 &&
        hour <= 10
      ) ||
      (
        hour >= 17 &&
        hour <= 20
      )
        ? 1
        : 0


    const rawCondition =
      (
        weather?.path?.condition ||
        ""
      ).toLowerCase()


    const visibility =
  rawCondition.includes("fog")
    ? "low"
    : rawCondition.includes("rain") ||
      rawCondition.includes("drizzle") ||
      rawCondition.includes("thunderstorm") ||
      rawCondition.includes("snow")
        ? "medium"
        : "high";


    // ------------------------------------------
    // 6. Segment-Level ML Predictions
    // ------------------------------------------

    const routePredictions =
      await Promise.all(

        routeResults.map(
          async (route) => {


            const segments =
              route.details.roadSegments


            const segmentPredictions =
              await Promise.all(

                segments.map(
                  async (segment) => {


                    const mlPayload = {

                      day_of_week:
                        dayOfWeek,

                      road_type:
                        mapRoadType(
                          segment.type
                        ),

                      weather:
                        mapWeather(
                          weather?.path?.condition
                        ),

                      visibility,

                      festival:
                        "No Festival",

                      hour,

                      is_weekend:
                        isWeekend,

                      lanes:
                        segment.lanes,

                      traffic_signal:
                        segment.trafficSignal,

                      temperature:
                        weather?.path?.temperature ||
                        30,

                      is_peak_hour:
                        isPeakHour,

                      route_coordinates:
                        route.coords.map(
                          ([lon, lat]) =>
                            [lat, lon]
                        ),

                      segment_coordinates:
                        segment.coords.map(
                          ([lon, lat]) =>
                            [lat, lon]
                        ),
                    }


                    console.log(
                      "\n========== SEGMENT DEBUG =========="
                    )


                    console.log(
                      "Segment:",
                      segment.segmentIndex
                    )


                    console.log(
                      "Road:",
                      segment.road
                    )


                    console.log(
                      "Road Type:",
                      segment.type
                    )


                    console.log(
                      "Distance:",
                      segment.distanceKm,
                      "km"
                    )


                    console.log(
                      "====================================\n"
                    )


                    try {

                      const mlRes =
                        await axios.post(
                          `${ML_API}/predict`,
                          mlPayload,
                          { timeout: 15000 }
                        )


                      return {

                        segmentIndex:
                          segment.segmentIndex,

                        road:
                          segment.road,

                        type:
                          segment.type,

                        distanceKm:
                          segment.distanceKm,

                        trafficSignal:
                          segment.trafficSignal,

                        lanes:
                          segment.lanes,

                        segWeather:
                          mapWeather(
                            weather?.path?.condition
                          ),

                        segVisibility:
                          visibility,

                        ...mlRes.data,
                      }

                    } catch (error) {

                      console.warn(
                        `ML prediction failed for segment ${segment.segmentIndex}:`,
                        error.message
                      )


                      return null
                    }
                  }
                )
              )


            const validSegments =
              segmentPredictions.filter(Boolean)


            if (
              validSegments.length === 0
            ) {
              return null
            }


            // ----------------------------------
            // MULTI-FACTOR WEIGHTED CONTEXTUAL RISK
            // ----------------------------------

            const weightedData =
              validSegments.reduce(
                (acc, seg) => {
                  const w =
                    computeSegmentWeight(
                      seg, hour
                    )
                  return {
                    weightSum:
                      acc.weightSum + w,
                    riskSum:
                      acc.riskSum +
                      seg.predicted_risk * w,
                  }
                },
                {
                  weightSum: 0,
                  riskSum: 0,
                }
              )

            const totalWeight =
              weightedData.weightSum || 1


            const contextualRisk =
              weightedData.riskSum /
              totalWeight


            const hotspotPenalty =
              validSegments[0]?.hotspot_penalty || 0


            const finalRisk =
              Math.min(
                contextualRisk +
                hotspotPenalty,
                1.0
              )


            const totalHotspots =
              validSegments[0]?.hotspot_count || 0

            const totalSegmentHotspots =
              validSegments.reduce(
                (sum, seg) =>
                  sum + (seg.segment_hotspot_count || 0),
                0
              )


            const severity =
              finalRisk <= 0.35
                ? "Low"
                : finalRisk <= 0.65
                  ? "Medium"
                  : "High"
            const explanation =  validSegments.find(s => s.explanation)?.explanation ||"No explanation available.";
    
            return {
              predicted_risk: Number(contextualRisk.toFixed(3)),
              hotspot_count: totalHotspots,
              total_segment_hotspots: totalSegmentHotspots,
              hotspot_penalty: Number(hotspotPenalty.toFixed(3)),
              final_risk: Number(finalRisk.toFixed(3)),
              severity,
              explanation,
              segment_predictions: validSegments, 
            }
          }
        )
      )


    // ------------------------------------------
    // 7. Rank Routes
    // ------------------------------------------

    const routesWithPredictions =
      routeResults

        .map(
          (route, index) => ({

            ...route,

            prediction:
              routePredictions[index],
          })
        )

        .filter(
          route =>
            route.prediction !== null
        )

        .sort(
          (a, b) =>
            a.prediction.final_risk -
            b.prediction.final_risk
        )

        .map(
          (
            route,
            index,
            sorted
          ) => {


            const risk =
              route.prediction.final_risk


            const band =
              risk <= 0.35
                ? 0
                : risk <= 0.65
                  ? 1
                  : 2


            const getBand =
              route =>
                route.prediction.final_risk <= 0.35
                  ? 0
                  : route.prediction.final_risk <= 0.65
                    ? 1
                    : 2


            const bands =
              sorted.map(getBand)


            const allSame =
              bands.every(
                band =>
                  band === bands[0]
              )


            let key


            if (allSame) {

              if (bands[0] === 2) {

                key =
                  index === 0
                    ? "moderate"
                    : "risky"

              } else {

                key =
                  index === 0
                    ? "safe"
                    : index === 1
                      ? "moderate"
                      : "risky"
              }

            } else {

              key =
                band === 0
                  ? "safe"
                  : band === 1
                    ? "moderate"
                    : "risky"
            }


            return {

              ...route,

              key,
            }
          }
        )


    // ------------------------------------------
    // 8. Response
    // ------------------------------------------

    res.json({

      sourceCoords:
        srcCoords,

      destCoords:
        dstCoords,

      routes:
        routesWithPredictions,

      weather,
    })


  } catch (err) {

    console.error(
      "Routing error:",
      err
    )


    res.status(500).json({

      error:
        err.message ||
        "Internal error",
    })
  }
})


// ==================================================
// WEATHER API
// ==================================================

app.get("/api/weather", async (req, res) => {

  try {

    const {
      lat,
      lon,
    } = req.query


    if (!lat || !lon) {

      return res.status(400).json({

        error:
          "lat and lon required",
      })
    }


    const weather =
      await getWeather(
        parseFloat(lat),
        parseFloat(lon)
      )


    if (!weather) {

      return res.status(500).json({

        error:
          "Weather fetch failed",
      })
    }


    res.json(weather)

  } catch (err) {

    res.status(500).json({

      error:
        err.message,
    })
  }
})


// ==================================================
// HEALTH
// ==================================================

app.get("/api/health", (_req, res) => {

  res.json({

    status: "ok",

    uptime:
      process.uptime(),
  })
})


// ==================================================
// CALENDAR
// ==================================================

app.get("/api/calendar", (_req, res) => {

  const now =
    new Date()


  const days = [

    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",

  ]


  const dayOfWeek =
    days[now.getDay()]


  const isWeekend =
    now.getDay() === 0 ||
    now.getDay() === 6


  res.json({

    date:
      now.toISOString().slice(0, 10),

    dayOfWeek,

    isWeekend,

    timestamp:
      now.toISOString(),
  })
})


// ==================================================
// START SERVER
// ==================================================

const PORT =
  process.env.PORT || 3001


app.listen(PORT, () => {

  console.log(
    `\n✓ Backend running on http://localhost:${PORT}`
  )

  console.log(
    `✓ Health check: http://localhost:${PORT}/api/health`
  )

  console.log(
    `✓ Route API: POST http://localhost:${PORT}/api/routes\n`
  )
})
