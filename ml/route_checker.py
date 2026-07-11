import os
import pandas as pd
from shapely.geometry import LineString, Point

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOTSPOT_PATH = os.path.join(BASE_DIR, "outputs", "hotspots.csv")


def check_route_hotspots(route_coordinates):
    hotspots = pd.read_csv(HOTSPOT_PATH)

    # Convert (lat, lon) -> (lon, lat) for Shapely
    route = LineString([(lon, lat) for lat, lon in route_coordinates])
    hotspot_count = 0

    for _, row in hotspots.iterrows():
        hotspot = Point(row["longitude"], row["latitude"])

        if route.distance(hotspot) <= 0.003:
            hotspot_count += 1


    return hotspot_count


if __name__ == "__main__":

    #dummy route --> OSRM coordinates
    route = [
        (28.6130, 77.2100),
        (28.6200, 77.2200),
        (28.6250, 77.2300),
        (28.6300, 77.2400)
    ]

    hotspot_count, severity = check_route_hotspots(route)

    print("Hotspots Found :", hotspot_count)
    print("Severity :", severity)
