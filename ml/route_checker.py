import os
import pandas as pd
from shapely.geometry import LineString, Point

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HOTSPOT_PATH = os.path.join(BASE_DIR, "outputs", "hotspots.csv")

def check_route_hotspots(route_coordinates: list[tuple[float, float]]) -> int:

    print("\n========== HOTSPOT DEBUG ==========")
    print("HOTSPOT PATH:", HOTSPOT_PATH)
    print("Route Coordinates:", route_coordinates)

    hotspots = pd.read_csv(HOTSPOT_PATH)

    print("Total Hotspots Loaded:", len(hotspots))

    route = LineString([(lon, lat) for lat, lon in route_coordinates])

    hotspot_count = 0

    for _, row in hotspots.iterrows():

        hotspot = Point(row["longitude"], row["latitude"])

        if route.distance(hotspot) <= 0.005:
            hotspot_count += 1

    print("Hotspots Found:", hotspot_count)
    print("===================================\n")

    print("Loaded hotspots:", len(hotspots))
    print("Route coordinates:", route_coordinates)
    print("Detected hotspot count:", hotspot_count)

    return hotspot_count


if __name__ == "__main__":

    #dummy route --> OSRM coordinates
    route = [
        (28.6130, 77.2100),
        (28.6200, 77.2200),
        (28.6250, 77.2300),
        (28.6300, 77.2400)
    ]

    hotspot_count = check_route_hotspots(route)
    print("Hotspots Found :", hotspot_count)
