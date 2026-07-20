# AI-Based Traffic Risk & Safe Route Recommendation System

An AI-powered route recommendation system that analyzes historical accident data, real-time weather, road characteristics, and accident hotspots to predict route risk and recommend the safest path. Built with a three-tier architecture — React frontend, Express backend, FastAPI ML server.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Frontend      │────▶│   Backend        │────▶│   ML Server      │
│  React + Vite   │     │  Express + Axios │     │  FastAPI + GB    │
│  :5173          │◀────│  :3001           │◀────│  :8000           │
└─────────────────┘     └─────────────────┘     └──────────────────┘
                              │                         │
                              ▼                         ▼
                       OSRM Routing            Gradient Boosting
                       Nominatim Geo           DBSCAN Hotspot
                       OpenWeather             Accident Dataset
```

## Features

- **Multi-route comparison** — Fetches 3 alternative routes (fastest, shortest, balanced) from OSRM
- **ML-powered risk scoring** — Gradient Boosting model (11 features) predicts per-segment accident risk
- **DBSCAN hotspot detection** — Spatial clustering identifies 97+ historical accident hotspots from a 55K+ record Indian roads dataset
- **Weather-aware analysis** — Auto-fetches real-time weather data for the route; degraded conditions increase risk
- **Per-segment risk visualization** — Each road segment is color-coded (green/yellow/red) on the map; hover to see risk details
- **Weighted contextual risk** — Segments contribute to route risk proportional to distance, severity, weather, visibility, hotspot proximity, road type, traffic signals, lane count, and time of day
- **Spatial hotspot penalty** — Routes passing through DBSCAN-identified accident clusters get an additive penalty (0–15%)
- **AI explanation** — Rule-based or Hugging Face LLM-generated explanation of route risk factors (contextual vs spatial)
- **Interactive map** — Leaflet-based map with click-to-select routes, hover tooltips, and animated line rendering
- **Dark/light theme** — Toggleable UI theme with glassmorphism design

## Tech Stack

| Layer     | Technology                                                |
|-----------|-----------------------------------------------------------|
| Frontend  | React 18, TypeScript, Vite 6, Tailwind CSS 4, Leaflet, MUI, Radix UI, Framer Motion |
| Backend   | Node.js, Express, Axios, dotenv                           |
| ML Server | Python 3, FastAPI, scikit-learn (GradientBoostingRegressor), DBSCAN, pandas, joblib |
| APIs      | OSRM (routing), Nominatim (geocoding), OpenWeatherMap (weather) |

## Project Structure

```
├── frontend/          # React app
│   └── src/app/
│       ├── App.tsx                           # Main UI — input panel, card grid, AI panel
│       ├── components/
│       │   ├── MapView.tsx                    # Leaflet map with route polylines & tooltips
│       │   └── RouteDetailsCard.tsx          # Route detail panel
│       └── ...
├── backend/
│   ├── server.js                             # Express API — routing, geocoding, weather, ML orchestration
│   ├── package.json
│   └── .env                                  # ML_API_URL=http://localhost:8000
├── ml/
│   ├── server.py                             # FastAPI server — /predict endpoint
│   ├── predict.py                            # Model inference (Gradient Boosting)
│   ├── retrain.py                            # Training script with 11 features (no lat/lon)
│   ├── risk.py                               # Penalty & severity calculation
│   ├── route_checker.py                      # DBSCAN hotspot detection per route/segment
│   ├── hotspot.py                            # Hotspot generation via DBSCAN clustering
│   ├── explain_route.py                      # AI explanation generation (rule-based or HuggingFace)
│   ├── requirements.txt
│   ├── best_gradient_boosting.pkl            # Trained model
│   ├── preprocessor.pkl                      # One-hot encoder + column transformer
│   └── outputs/hotspots.csv                  # 97 DBSCAN cluster centroids
├── dataset/
│   └── indian_roads_dataset.csv              # 55K+ Indian road accident records
└── notebooks/                                # Jupyter notebooks (EDA, feature selection, GBR)
```

## How to Run Locally

### Prerequisites

- Node.js 18+
- Python 3.10+
- npm or yarn

### 1. ML Server (FastAPI)

```bash
cd ml
pip install -r requirements.txt
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2. Backend (Express)

```bash
cd backend
npm install
npm run dev
```

Expected output:
```
Server running on http://localhost:3001
```

### 3. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Expected output:
```
VITE ready on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

### Optional: AI Explanation with Hugging Face

Set a `HF_API_KEY` environment variable in a `.env` file inside `ml/`:

```
HF_API_KEY=hf_your_api_key_here
```

Without this key, the system falls back to rule-based explanations.

## API Endpoints

### `POST /api/routes` (Backend — `:3001`)

Request body:

```json
{
  "source": "Connaught Place, New Delhi",
  "destination": "Cyber City, Gurugram"
}
```

Returns 3 routes (safe, moderate, risky) with:
- Route geometry, distance, duration, road segments
- Per-segment ML predictions (`predicted_risk`, `final_risk`, `severity`, `segment_hotspot_count`)
- Route-level aggregated risk, hotspot penalty, and AI explanation

### `POST /predict` (ML Server — `:8000`)

Request body includes contextual features (weather, visibility, hour, road type, etc.) plus route coordinates for hotspot detection. Returns per-route/segment risk predictions.

## ML Model Details

- **Algorithm:** GradientBoostingRegressor (n_estimators=400, learning_rate=0.05, max_depth=2)
- **Features (11):** day_of_week, road_type, weather, visibility, festival, hour, is_weekend, lanes, traffic_signal, temperature, is_peak_hour
- **Excluded features:** latitude, longitude (no spatial data leakage into ML)
- **Model size:** ~1.6 MB (preprocessor + model)
- **Performance:** MAE ~0.085, RMSE ~0.110, R² ~0.097 (dataset has high variance)

## How Risk Scoring Works

### Contextual Risk (ML)

Each road segment is scored by the Gradient Boosting model using non-spatial factors:

| Feature       | Importance |
|---------------|-----------|
| visibility_low | 49.8%     |
| is_peak_hour   | 24.9%     |
| weather_clear  | 13.2%     |
| visibility_high | 9.8%      |

The route's **contextual risk** is a **weighted average** of segment risks:

```
weight = distanceKm × severityW × hotspotW × visibilityW × weatherW × roadW × signalW × laneW × timeW
contextualRisk = Σ(segment.predicted_risk × weight) / Σ(weight)
```

### Spatial Hotspot Penalty

DBSCAN clustering (haversine distance, 0.3 km radius, min 5 samples) identifies 97 accident cluster centroids from historical data. For each route:

1. The route's geometry is checked against all hotspot centroids
2. Per-segment hotspot counts are computed using the segment's own coordinates (for display)
3. Route-level penalty based on total hotspot count:
   - 0 hotspots → +0%
   - 1–2 hotspots → +5%
   - 3–5 hotspots → +10%
   - 6+ hotspots → +15%

### Final Risk

```
finalRisk = min(contextualRisk + hotspotPenalty, 1.0)
```

### Severity

| Final Risk | Severity |
|------------|----------|
| ≤ 0.35     | Low      |
| ≤ 0.65     | Medium   |
| > 0.65     | High     |

## Hotspot Detection

Run the DBSCAN clustering independently:

```bash
cd ml
python3 hotspot.py
```

This reads the dataset, performs DBSCAN on lat/lon coordinates with haversine distance, and writes cluster centroids to `ml/outputs/hotspots.csv`.

