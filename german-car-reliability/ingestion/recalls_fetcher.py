"""
NHTSA Recalls Fetcher

Pulls vehicle recalls from NHTSA's recallsByVehicle endpoint for every
make/model/year in our curated list and saves them to a 'recalls' table
in the existing cars.db SQLite database.

Run with:
    python ingestion/recalls_fetcher.py

Safe to re-run: uses INSERT OR IGNORE on the NHTSA campaign number primary key.
"""

import json
import os
import sqlite3
import time
import urllib.parse
import urllib.request
from datetime import datetime

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import GERMAN_CARS, START_YEAR, END_YEAR, DATABASE_PATH


API_BASE = "https://api.nhtsa.gov/recalls/recallsByVehicle"
DELAY_SECONDS = 0.5  # Be polite, don't hammer the API


def setup_recalls_table(conn):
    """Create the recalls table if it doesn't exist."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recalls (
            -- A car may share a campaign with other cars, so primary key
            -- is the combination of campaign + make + model + year
            campaign_number TEXT NOT NULL,
            make            TEXT NOT NULL,
            model           TEXT NOT NULL,
            model_year      INTEGER NOT NULL,
            manufacturer    TEXT,
            component       TEXT,
            summary         TEXT,
            consequence     TEXT,
            remedy          TEXT,
            notes           TEXT,
            report_date     TEXT,
            park_it         INTEGER DEFAULT 0,
            park_outside    INTEGER DEFAULT 0,
            ota_update      INTEGER DEFAULT 0,
            fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (campaign_number, make, model, model_year)
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_recalls_car
        ON recalls (make, model, model_year)
    """)
    conn.commit()


def fetch_recalls(make, model, year):
    """
    Fetch recalls for one specific make/model/year combination.
    Returns a list of recall dicts. May be empty.
    """
    params = {"make": make, "model": model, "modelYear": str(year)}
    url = f"{API_BASE}?{urllib.parse.urlencode(params)}"

    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = json.loads(response.read())
            return data.get("results", [])
    except Exception as e:
        print(f"  ! Error fetching {make} {model} {year}: {e}")
        return []


def save_recalls(conn, recalls, make, model, year):
    """Save recall records to SQLite. Uses INSERT OR IGNORE to skip duplicates."""
    cursor = conn.cursor()
    saved_count = 0

    for r in recalls:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO recalls (
                    campaign_number, make, model, model_year, manufacturer,
                    component, summary, consequence, remedy, notes,
                    report_date, park_it, park_outside, ota_update
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r.get("NHTSACampaignNumber", "UNKNOWN"),
                make.upper(),
                model.upper(),
                int(year),
                r.get("Manufacturer", ""),
                r.get("Component", ""),
                r.get("Summary", ""),
                r.get("Consequence", ""),
                r.get("Remedy", ""),
                r.get("Notes", ""),
                r.get("ReportReceivedDate", ""),
                1 if r.get("parkIt", False) else 0,
                1 if r.get("parkOutSide", False) else 0,
                1 if r.get("overTheAirUpdate", False) else 0,
            ))
            if cursor.rowcount > 0:
                saved_count += 1
        except sqlite3.Error as e:
            print(f"    ! DB error: {e}")

    conn.commit()
    return saved_count


def main():
    print("=" * 60)
    print("NHTSA Recalls Fetcher")
    print("=" * 60)
    print(f"Database: {DATABASE_PATH}")
    print(f"Years: {START_YEAR} to {END_YEAR}")

    # Connect to DB (same file as complaints)
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    setup_recalls_table(conn)

    total_calls = 0
    total_recalls_found = 0
    total_new_saved = 0

    # Count total cars for progress display
    total_cars = sum(
        len(models) * (END_YEAR - START_YEAR + 1)
        for models in GERMAN_CARS.values()
    )
    current = 0

    start_time = time.time()

    for make, models in GERMAN_CARS.items():
        print(f"\n── {make} " + "─" * (50 - len(make)))

        for model in models:
            for year in range(START_YEAR, END_YEAR + 1):
                current += 1
                recalls = fetch_recalls(make, model, year)
                total_calls += 1
                total_recalls_found += len(recalls)

                if recalls:
                    new_saved = save_recalls(conn, recalls, make, model, year)
                    total_new_saved += new_saved
                    print(
                        f"  [{current}/{total_cars}] {make} {model} {year} "
                        f"... {len(recalls)} recalls ({new_saved} new)"
                    )

                time.sleep(DELAY_SECONDS)

    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print("DONE")
    print(f"  API calls made:       {total_calls}")
    print(f"  Recalls found:        {total_recalls_found}")
    print(f"  New records saved:    {total_new_saved}")
    print(f"  Elapsed time:         {elapsed:.0f}s")
    print(f"  Database location:    {DATABASE_PATH}")
    print("=" * 60)

    conn.close()


if __name__ == "__main__":
    main()