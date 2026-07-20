from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware

from predict import predict_risk
from route_checker import check_route_hotspots
from risk import calculate_penalty, calculate_severity
from explain_route import explain_route


app = FastAPI(
    title="Safe Route Recommendation API",
    version="1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RouteRequest(BaseModel):
    day_of_week: str

    road_type: Optional[str] = None

    weather: str
    visibility: str
    festival: str

    hour: int
    is_weekend: int

    lanes: Optional[int] = None

    traffic_signal: int
    temperature: float
    is_peak_hour: int

    route_coordinates: List[List[float]]
    segment_coordinates: Optional[List[List[float]]] = None
    hotspot_radius_deg: Optional[float] = None



@app.get("/")
def home():
    return {"status": "running"}


@app.post("/predict")
def predict_route(data: RouteRequest):

    try:

        road_type = data.road_type or "urban"
        lanes = data.lanes or 2

        route_features = {
            "day_of_week": data.day_of_week,
            "road_type": road_type,
            "weather": data.weather,
            "visibility": data.visibility,
            "festival": data.festival,
            "hour": data.hour,
            "is_weekend": data.is_weekend,
            "lanes": lanes,
            "traffic_signal": data.traffic_signal,
            "temperature": data.temperature,
            "is_peak_hour": data.is_peak_hour,
        }

        predicted_risk = predict_risk(route_features)

        radius = data.hotspot_radius_deg if data.hotspot_radius_deg is not None else 0.002

        # Route-level hotspot count (for penalty calculation)
        hotspot_count = check_route_hotspots(
            data.route_coordinates, radius
        ) if len(data.route_coordinates) >= 2 else 0

        # Per-segment hotspot count (for display)
        segment_hotspot_count = 0
        if data.segment_coordinates and len(data.segment_coordinates) >= 2:
            segment_hotspot_count = check_route_hotspots(
                data.segment_coordinates, radius
            )

        hotspot_penalty = calculate_penalty(hotspot_count)

        final_risk = min(predicted_risk + hotspot_penalty, 1.0)

        severity = calculate_severity(final_risk)

        explanation = explain_route(
            weather=data.weather,
            visibility=data.visibility,
            peak_hour="Yes" if data.is_peak_hour else "No",
            road_type=road_type,
            contextual_risk=round(predicted_risk, 2),
            hotspot_count=hotspot_count,
            hotspot_penalty=hotspot_penalty,
        )

        return {
            "predicted_risk": round(predicted_risk, 3),
            "hotspot_count": hotspot_count,
            "segment_hotspot_count": segment_hotspot_count,
            "hotspot_penalty": round(hotspot_penalty, 3),
            "severity": severity,
            "final_risk": round(final_risk, 3),
            "explanation": explanation,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )