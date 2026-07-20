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


def _fallback_explanation(weather, visibility, peak_hour, road_type, contextual_risk, hotspot_count, hotspot_penalty):
    lines = []
    overall = contextual_risk + hotspot_penalty
    if overall >= 0.65:
        lines.append(f"This route has a high final risk score ({overall:.2f}).")
    elif overall >= 0.35:
        lines.append(f"The route carries a moderate final risk level ({overall:.2f}).")
    else:
        lines.append(f"The route is relatively safe with a low risk score ({overall:.2f}).")

    # Contextual risk factors
    factors = []
    if weather.lower() not in ("clear", "unknown"):
        factors.append(f"{weather.lower()} weather")
    if visibility.lower() == "low":
        factors.append("low visibility")
    if peak_hour == "Yes":
        factors.append("peak hour traffic")
    if road_type and road_type.lower() == "urban":
        factors.append("urban road conditions")

    if factors:
        risk_pct = round(contextual_risk * 100)
        lines.append(f"Contextual risk ({risk_pct}%) from: {' and '.join(factors)}.")
    else:
        lines.append(f"Baseline contextual risk is {round(contextual_risk * 100)}%.")

    # Hotspot penalty (spatial risk)
    if hotspot_count > 0:
        lines.append(f"Spatial risk: route passes through {hotspot_count} known accident hotspot{'s' if hotspot_count > 1 else ''} identified via historical accident clustering, adding +{round(hotspot_penalty * 100)}% to the risk.")

    lines.append("Drive carefully, obey traffic signals, and maintain safe following distance.")

    return " ".join(lines)


def explain_route(weather,
                  visibility,
                  peak_hour,
                  road_type,
                  contextual_risk,
                  hotspot_count,
                  hotspot_penalty):

    if not _use_ai:
        return _fallback_explanation(weather, visibility, peak_hour, road_type, contextual_risk, hotspot_count, hotspot_penalty)

    prompt = f"""
You are an AI Road Safety Assistant.

Weather: {weather}
Visibility: {visibility}
Peak Hour: {peak_hour}
Road Type: {road_type}
Contextual Risk (ML): {contextual_risk}
Hotspot Penalty (Spatial): {hotspot_penalty}
Hotspots Encountered: {hotspot_count}

Explain why this route is risky in 3-4 simple sentences.
Separate contextual factors (weather, visibility, peak hour) from spatial factors (accident hotspots identified via historical clustering).
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
        return _fallback_explanation(weather, visibility, peak_hour, road_type, contextual_risk, hotspot_count, hotspot_penalty)


if __name__ == "__main__":

    print(
        explain_route(
            "Rain",
            "Low",
            "Yes",
            "Highway",
            0.42,
            4,
            0.10
        )
    )