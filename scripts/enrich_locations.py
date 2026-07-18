import csv
import time
import requests

INPUT_FILE = "locations.csv"
OUTPUT_FILE = "locations_enriched.csv"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

HEADERS = {
    "User-Agent": "EarthExplorer-Enzi/1.0 (contact: xexinkansichi@hotmail.com)"
}

REQUEST_DELAY = 2  # safer delay
BATCH_PAUSE_EVERY = 10
BATCH_PAUSE_TIME = 10

# reuse connection
session = requests.Session()


def query_nominatim(query, retries=3):
    for attempt in range(retries):
        try:
            response = session.get(
                NOMINATIM_URL,
                headers=HEADERS,
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1
                },
                timeout=10
            )

            if response.status_code == 403:
                print(f"⚠️ 403 blocked for '{query}'. Backing off...")
                time.sleep(5 * (attempt + 1))
                continue

            response.raise_for_status()
            data = response.json()

            return data[0] if data else None

        except Exception as e:
            print(f"Retry {attempt+1} failed for '{query}': {e}")
            time.sleep(2 * (attempt + 1))

    return None


def classify_type(osm_type):
    mapping = {
        "hotel": "hotel",
        "restaurant": "restaurant",
        "cafe": "restaurant",
        "fast_food": "restaurant",
        "bar": "nightlife",
        "pub": "nightlife",
        "museum": "museum",
        "park": "park",
        "forest": "nature",
        "beach": "beach",
        "river": "river",
        "water": "water",
        "attraction": "landmark",
        "yes": "landmark"
    }
    return mapping.get(osm_type, "unknown")


def is_generic_name(name):
    generic_keywords = [
        "market", "village", "area", "river", "bay", "beach",
        "estate", "district", "park", "lake"
    ]
    name_lower = name.lower()
    return any(word in name_lower for word in generic_keywords)


def process_row(row):
    country = row["country"]
    city = row["city"]
    name = row["hotspot"]

    original_lat = row["latitude"]
    original_lng = row["longitude"]

    query = f"{name} {city} {country}"
    result = query_nominatim(query)

    if not result:
        return {
            "country": country,
            "city": city,
            "hotspot": name,
            "latitude": original_lat,
            "longitude": original_lng,
            "type": "unknown",
            "precision": "area",
            "confidence": "low",
            "source": "original"
        }

    new_lat = result.get("lat")
    new_lng = result.get("lon")
    osm_type = result.get("type", "unknown")
    display_name = result.get("display_name", "").lower()

    name_match = name.lower() in display_name
    generic = is_generic_name(name)

    # confidence logic
    if name_match and not generic:
        confidence = "high"
        precision = "exact"
    elif name_match:
        confidence = "medium"
        precision = "estimated"
    else:
        confidence = "low"
        precision = "estimated"

    # overwrite logic
    if confidence == "high":
        lat = new_lat
        lng = new_lng
        source = "osm"
    else:
        lat = original_lat
        lng = original_lng
        source = "original"

    return {
        "country": country,
        "city": city,
        "hotspot": name,
        "latitude": lat,
        "longitude": lng,
        "type": classify_type(osm_type),
        "precision": precision,
        "confidence": confidence,
        "source": source
    }


def main():
    with open(INPUT_FILE, newline="", encoding="utf-8") as infile, \
         open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as outfile:

        reader = csv.DictReader(infile)

        fieldnames = [
            "country", "city", "hotspot",
            "latitude", "longitude",
            "type", "precision", "confidence", "source"
        ]

        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()

        for i, row in enumerate(reader, start=1):
            print(f"Processing {i}: {row['hotspot']}")

            enriched = process_row(row)
            writer.writerow(enriched)

            # rate limiting
            time.sleep(REQUEST_DELAY)

            # batch pause to avoid blocking
            if i % BATCH_PAUSE_EVERY == 0:
                print(f"🛑 Pausing after {i} requests...")
                time.sleep(BATCH_PAUSE_TIME)


if __name__ == "__main__":
    main()