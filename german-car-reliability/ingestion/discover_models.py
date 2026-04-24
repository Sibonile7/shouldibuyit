"""
Model Name Discovery

NHTSA uses specific model names (like "328" or "C300")
not series names (like "3-SERIES" or "C-CLASS").

This script queries the NHTSA API to find out exactly
what model names exist for each German brand, for each year.

Run this FIRST to build your config.py with correct names.

Usage:
    python ingestion/discover_models.py
"""

import json
import time
import urllib.request


GERMAN_MAKES = [
    "BMW",
    "MERCEDES-BENZ",
    "AUDI",
    "VOLKSWAGEN",
    "PORSCHE",
]

START_YEAR = 2010
END_YEAR = 2024

# NHTSA endpoint that lists available models for a make/year
MODELS_URL = "https://api.nhtsa.gov/products/vehicle/models?make={make}&modelYear={year}&issueType=c"


def get_models(make, year):
    """Fetch the list of model names NHTSA has for a make/year."""
    url = MODELS_URL.format(make=make, year=year)

    try:
        request = urllib.request.Request(url)
        request.add_header("User-Agent", "german-car-reliability/1.0")

        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        results = data.get("results", [])
        models = [r.get("model", "") for r in results if r.get("model")]
        return sorted(set(models))

    except Exception as e:
        print(f"  Error fetching {make} {year}: {e}")
        return []


def run():
    print("=" * 60)
    print("NHTSA Model Name Discovery")
    print("=" * 60)
    print(f"Checking {len(GERMAN_MAKES)} brands, {START_YEAR}-{END_YEAR}\n")

    # Collect all unique models per brand across all years
    brand_models = {}

    for make in GERMAN_MAKES:
        print(f"\n── {make} {'─' * (45 - len(make))}")
        all_models = set()

        for year in range(START_YEAR, END_YEAR + 1):
            models = get_models(make, year)
            if models:
                all_models.update(models)
                print(f"  {year}: {len(models)} models")
            else:
                print(f"  {year}: no models found")
            time.sleep(0.3)

        brand_models[make] = sorted(all_models)
        print(f"  TOTAL unique models: {len(brand_models[make])}")

    # Print the results as a Python dict you can paste into config.py
    print("\n\n" + "=" * 60)
    print("COPY THIS INTO config.py as GERMAN_CARS:")
    print("=" * 60 + "\n")

    print("GERMAN_CARS = {")
    for make, models in brand_models.items():
        print(f'    "{make}": [')
        for model in models:
            print(f'        "{model}",')
        print("    ],")
    print("}")


if __name__ == "__main__":
    run()