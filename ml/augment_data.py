import pandas as pd
import numpy as np

df = pd.read_csv("../dataset/indian_roads_dataset.csv")

original_mean = df["risk_score"].mean()
original_std = df["risk_score"].std()

rt_adjust = {"highway": -0.15, "rural": 0.05, "urban": 0.15}
lanes_mean = df["lanes"].mean()

def adjust_risk(row):
    risk = row["risk_score"]
    risk += rt_adjust.get(row["road_type"], 0.0)
    risk += (row["lanes"] - lanes_mean) * -0.03
    if row["traffic_signal"] == 1:
        risk += 0.10
    return max(0.02, min(0.98, risk))

df["risk_score"] = df.apply(adjust_risk, axis=1)

new_mean = df["risk_score"].mean()
new_std = df["risk_score"].std()

df.to_csv("../dataset/indian_roads_dataset.csv", index=False)

print(f"Original: mean={original_mean:.3f} std={original_std:.3f}")
print(f"Augmented: mean={new_mean:.3f} std={new_std:.3f}")

print("\n=== Risk by road_type (after) ===")
for rt in ["highway", "urban", "rural"]:
    s = df[df["road_type"] == rt]["risk_score"]
    print(f"  {rt}: mean={s.mean():.3f}")

print("\n=== Risk by lanes (after) ===")
for l in sorted(df["lanes"].unique()):
    s = df[df["lanes"] == l]["risk_score"]
    print(f"  {l} lanes: mean={s.mean():.3f}")

print("\n=== Risk by traffic_signal (after) ===")
for ts in [0, 1]:
    s = df[df["traffic_signal"] == ts]["risk_score"]
    print(f"  signal={ts}: mean={s.mean():.3f}")

print("\n=== Risk by weather (after) ===")
for w in ["clear", "fog", "rain"]:
    s = df[df["weather"] == w]["risk_score"]
    print(f"  {w}: mean={s.mean():.3f}")

print("\n=== Risk by is_peak_hour (after) ===")
for ph in [0, 1]:
    s = df[df["is_peak_hour"] == ph]["risk_score"]
    print(f"  peak={ph}: mean={s.mean():.3f}")
