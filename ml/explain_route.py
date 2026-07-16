import os
from dotenv import load_dotenv

load_dotenv()
HF_API_KEY = os.getenv("HF_API_KEY")

_use_ai = False
_client = None

if HF_API_KEY:
    from huggingface_hub import InferenceClient
    _client = InferenceClient(api_key=HF_API_KEY)
    _use_ai = True


def _fallback_explanation(weather, visibility, peak_hour, road_type, predicted_risk, hotspot_count):
    lines = []
    if predicted_risk >= 0.65:
        lines.append(f"This route has a high risk score ({predicted_risk}), indicating significant safety concerns.")
    elif predicted_risk >= 0.35:
        lines.append(f"The route carries a moderate risk level ({predicted_risk}), with some factors increasing caution.")
    else:
        lines.append(f"The route is relatively safe with a low risk score ({predicted_risk}).")

    if hotspot_count > 0:
        lines.append(f"There are {hotspot_count} known accident hotspots along the way, which increase the overall risk.")
    if weather.lower() not in ("clear", "unknown"):
        lines.append(f"Current {weather.lower()} conditions may affect driving safety.")
    if peak_hour == "Yes":
        lines.append("Peak hour traffic adds to the risk due to higher vehicle density.")
    lines.append("Drive carefully, obey traffic signals, and maintain safe following distance.")

    return " ".join(lines)


def explain_route(weather,
                  visibility,
                  peak_hour,
                  road_type,
                  predicted_risk,
                  hotspot_count):

    if not _use_ai:
        return _fallback_explanation(weather, visibility, peak_hour, road_type, predicted_risk, hotspot_count)

    prompt = f"""
You are an AI Road Safety Assistant.

Weather: {weather}
Visibility: {visibility}
Peak Hour: {peak_hour}
Road Type: {road_type}
Predicted Risk: {predicted_risk}
Hotspots Encountered: {hotspot_count}

Explain why this route is risky in 3-4 simple sentences.
Give one driving safety suggestion.
"""

    try:
        response = _client.chat.completions.create(
            model="meta-llama/Llama-3.1-8B-Instruct",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=200,
        )
        return response.choices[0].message.content
    except Exception:
        return _fallback_explanation(weather, visibility, peak_hour, road_type, predicted_risk, hotspot_count)


if __name__ == "__main__":

    print(
        explain_route(
            "Rain",
            "Low",
            "Yes",
            "Highway",
            0.62,
            4
        )
    )