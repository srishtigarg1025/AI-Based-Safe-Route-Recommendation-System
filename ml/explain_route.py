import os
from dotenv import load_dotenv
from huggingface_hub import InferenceClient

load_dotenv()
HF_API_KEY = os.getenv("HF_API_KEY")

client = InferenceClient(
    api_key=HF_API_KEY
)


def explain_route(weather,
                  visibility,
                  peak_hour,
                  road_type,
                  predicted_risk,
                  hotspot_count):

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

    response = client.chat.completions.create(
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