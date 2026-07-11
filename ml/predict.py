"""
predict.py

Loads the trained Gradient Boosting model and preprocessing pipeline,
accepts extracted route features, and returns the predicted accident
risk score.
"""

import os
import joblib
import pandas as pd


# -------------------------------------------------
# Load saved model and preprocessor
# -------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

model = joblib.load(os.path.join(BASE_DIR, "best_gradient_boosting.pkl"))
preprocessor = joblib.load(os.path.join(BASE_DIR, "preprocessor.pkl"))


# -------------------------------------------------
# Prediction Function
# -------------------------------------------------

def predict_risk(route_features):
    """
    Predict accident risk using the trained Gradient Boosting model.

    Parameters
    ----------
    route_features : dict
        Dictionary containing route features.

    Returns
    -------
    float
        Predicted risk score between 0 and 1.
    """

    # Convert dictionary to DataFrame
    sample = pd.DataFrame([route_features])

    # Apply preprocessing
    sample_processed = preprocessor.transform(sample)

    # Predict risk
    predicted_risk = model.predict(sample_processed)[0]

    return float(predicted_risk)


# -------------------------------------------------
# Example Test
# -------------------------------------------------

if __name__ == "__main__":

    sample_route = {
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

    risk = predict_risk(sample_route)

    print(f"Predicted Risk Score: {risk:.3f}")