"""
pipeline_test.py

Tests the complete ML pipeline:
1. Predict base risk
2. Check accident hotspots
3. Adjust risk using hotspot penalty
4. Generate AI explanation
"""

from predict import predict_risk
from route_checker import check_route_hotspots
from risk import adjust_risk
from explain_route import explain_route


# -------------------------------------------------
# Sample Route Features (Same format as ML model)
# -------------------------------------------------

route_features = {
    "day_of_week": "Monday",
    "road_type": "urban",
    "weather": "rain",
    "visibility": "low",
    "festival": "No Festival",
    "hour": 18,
    "is_weekend": 0,
    "lanes": 4,
    "traffic_signal": 1,
    "temperature": 30,
    "is_peak_hour": 1
}


# -------------------------------------------------
# Dummy Route Coordinates (Simulating OSRM Output)
# -------------------------------------------------

route_coordinates = [
    (28.6130, 77.2100),
    (28.6200, 77.2200),
    (28.6250, 77.2300),
    (28.6300, 77.2400)
]


# -------------------------------------------------
# Step 1 : Predict Base Risk
# -------------------------------------------------

predicted_risk = predict_risk(route_features)


# -------------------------------------------------
# Step 2 : Count Hotspots
# -------------------------------------------------

hotspot_count = check_route_hotspots(route_coordinates)


# -------------------------------------------------
# Step 3 : Adjust Risk
# -------------------------------------------------

hotspot_penalty = penalty  # from adjust_risk
final_risk = min(predicted_risk + hotspot_penalty, 1.0)
severity = "Low" if final_risk <= 0.35 else "Medium" if final_risk <= 0.65 else "High"


# -------------------------------------------------
# Step 4 : Generate Explanation
# -------------------------------------------------

explanation = explain_route(
    weather=route_features["weather"],
    visibility=route_features["visibility"],
    peak_hour="Yes" if route_features["is_peak_hour"] else "No",
    road_type=route_features["road_type"],
    contextual_risk=round(predicted_risk, 2),
    hotspot_count=hotspot_count,
    hotspot_penalty=hotspot_penalty,
)


# -------------------------------------------------
# Final Output
# -------------------------------------------------

print("\n" + "=" * 50)
print("        SAFE ROUTE ML PIPELINE TEST")
print("=" * 50)

print(f"Predicted Risk : {predicted_risk:.3f}")
print(f"Hotspot Count  : {hotspot_count}")
print(f"Penalty        : {penalty:.2f}")
print(f"Final Risk     : {final_risk:.3f}")
print(f"Severity       : {severity}")

print("\nAI Explanation:\n")
print(explanation)

print("=" * 50)
