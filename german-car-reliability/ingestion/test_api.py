"""
Quick test: Fetch complaints for ONE car to verify
the API works before running the full pipeline.

Usage:
    python ingestion/test_api.py

Expected output: A list of complaints for the 2014 BMW 3-Series,
printed to the terminal with component categories and summaries.
"""

import json
import urllib.request


def test():
    make = "BMW"
    model = "328I"
    year = 2014

    url = f"https://api.nhtsa.gov/complaints/complaintsByVehicle?make={make}&model={model}&modelYear={year}"

    print(f"Testing NHTSA API: {make} {model} {year}")
    print(f"URL: {url}\n")

    request = urllib.request.Request(url)
    request.add_header("User-Agent", "german-car-reliability/1.0")

    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))

    count = data.get("count", 0)
    print(f"Total complaints found: {count}\n")

    if count == 0:
        print("No complaints found. The API might be down or the model name might be wrong.")
        return

    # Show the component breakdown
    components = {}
    for complaint in data["results"]:
        comp = complaint.get("components", "UNKNOWN")
        components[comp] = components.get(comp, 0) + 1

    print("Complaints by component:")
    print("-" * 50)
    for comp, num in sorted(components.items(), key=lambda x: x[1], reverse=True):
        print(f"  {comp:40s} {num:4d}")

    # Show a few example summaries
    print(f"\nFirst 3 complaint summaries:")
    print("-" * 50)
    for complaint in data["results"][:3]:
        odi = complaint.get("odiNumber", "?")
        comp = complaint.get("components", "?")
        summary = complaint.get("summary", "")[:200]
        crash = "YES" if complaint.get("crash") else "no"
        print(f"\n  ODI #{odi}")
        print(f"  Component: {comp}")
        print(f"  Crash: {crash}")
        print(f"  Summary: {summary}...")


if __name__ == "__main__":
    test()