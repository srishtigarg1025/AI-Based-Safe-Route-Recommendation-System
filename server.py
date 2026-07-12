from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from predict import predict_risk
from route_checker import check_route_hotspots
from risk import adjust_risk
from explain_route import explain_route


# ----------------------------------------
# FastAPI App
# ----------------------------------------

app = FastAPI(
    title="Safe Route Recommendation API",
    version="1.0"
)

# ----------------------------------------
# CORS
# ----------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------
# Request Model
# ----------------------------------------

class RouteRequest(BaseModel):
    day_of_week: str
    road_type: str
    weather: str
    visibility: str
    festival: str
    hour: int
    is_weekend: int
    lanes: int
    traffic_signal: int
    temperature: float
    is_peak_hour: int

    route_coordinates: list


# ----------------------------------------
# Health Check
# ----------------------------------------

@app.get("/")
def home():
    return {"status": "running"}


# ----------------------------------------
# Prediction Endpoint
# ----------------------------------------

@app.post("/predict")
def predict_route(data: RouteRequest):

    try:

        route_features = {
            "day_of_week": data.day_of_week,
            "road_type": data.road_type,
            "weather": data.weather,
            "visibility": data.visibility,
            "festival": data.festival,
            "hour": data.hour,
            "is_weekend": data.is_weekend,
            "lanes": data.lanes,
            "traffic_signal": data.traffic_signal,
            "temperature": data.temperature,
            "is_peak_hour": data.is_peak_hour
        }

        # Step 1
        predicted_risk = predict_risk(route_features)

        # Step 2
        hotspot_count = check_route_hotspots(
            data.route_coordinates
        )

        # Step 3
        final_risk, penalty, severity = adjust_risk(
            predicted_risk,
            hotspot_count
        )

        # Step 4
        explanation = explain_route(
            weather=data.weather,
            visibility=data.visibility,
            peak_hour="Yes" if data.is_peak_hour else "No",
            road_type=data.road_type,
            predicted_risk=round(final_risk, 2),
            hotspot_count=hotspot_count
        )

        return {
            "predicted_risk": round(predicted_risk, 3),
            "hotspot_count": hotspot_count,
            "severity": severity,
            "penalty": penalty,
            "final_risk": round(final_risk, 3),
            "explanation": explanation
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )