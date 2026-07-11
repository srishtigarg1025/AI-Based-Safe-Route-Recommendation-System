import os
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "indian_roads_dataset.csv")
df = pd.read_csv(DATA_PATH)

coordinates = df[["latitude", "longitude"]].copy()
coordinates = coordinates.to_numpy()
coordinates = np.radians(coordinates)

EARTH_RADIUS_KM = 6371.0088
EPSILON = 0.3 / EARTH_RADIUS_KM
MIN_SAMPLES = 5

dbscan = DBSCAN(
    eps=EPSILON,
    min_samples=MIN_SAMPLES,
    metric="haversine",
    algorithm="ball_tree"
)

dbscan.fit(coordinates)

df["cluster"] = dbscan.labels_

hotspot_df = df[df["cluster"] != -1].copy()

hotspots = (
    hotspot_df
    .groupby("cluster")
    .agg(
        latitude=("latitude", "mean"),
        longitude=("longitude", "mean"),
        accident_count=("cluster", "count")
    )
    .reset_index()
)

OUTPUT_PATH = os.path.join(BASE_DIR, "outputs", "hotspots.csv")
hotspots.to_csv(OUTPUT_PATH, index=False)

print(f"Hotspots Found : {len(hotspots)}")
print(hotspots.head())
print(f"\nSaved to: {OUTPUT_PATH}")