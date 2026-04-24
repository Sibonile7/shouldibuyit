"""
NHTSA Complaint Fetcher

Fetches vehicle owner complaints from the NHTSA (National Highway
Traffic Safety Administration) public API and stores them in a
local SQLite database.

Usage:
    python ingestion/nhtsa_fetcher.py

    Run from the project root directory. The script will:
    1. Create the SQLite database and tables if they don't exist
    2. Loop through every German car brand/model/year in config.py
    3. Fetch complaints from the NHTSA API
    4. Store new complaints in the database (skips duplicates)
    5. Print progress as it goes

    Safe to run multiple times. It won't duplicate records.

API documentation:
    https://www.nhtsa.gov/nhtsa-datasets-and-apis
"""

import json
import os
import sqlite3
import sys
import time
import urllib.request
import urllib.error

# Add the project root to the path so we can import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingestion.config import GERMAN_CARS, START_YEAR, END_YEAR, DATABASE_PATH


# ── NHTSA API ──────────────────────────────────────────────────

NHTSA_BASE_URL = "https://api.nhtsa.gov/complaints/complaintsByVehicle"

# Seconds to wait between API calls. Be respectful to the
# government server. 0.5 seconds is polite and keeps you
# well under the ~100-200 requests/minute limit.
REQUEST_DELAY = 0.5


def fetch_complaints(make, model, year):
    """
    Call the NHTSA API for a specific make/model/year.

    Returns a list of complaint dictionaries, or an empty list
    if the request fails or no complaints exist.

    Example API URL:
    https://api.nhtsa.gov/complaints/complaintsByVehicle?make=BMW&model=3-SERIES&modelYear=2014
    """
    url = f"{NHTSA_BASE_URL}?make={make}&model={model}&modelYear={year}"

    try:
        request = urllib.request.Request(url)
        request.add_header("User-Agent", "german-car-reliability/1.0")

        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        if data.get("count", 0) == 0:
            return []

        return data.get("results", [])

    except urllib.error.HTTPError as e:
        print(f"    HTTP error {e.code} for {make} {model} {year}")
        return []
    except urllib.error.URLError as e:
        print(f"    Connection error for {make} {model} {year}: {e.reason}")
        return []
    except json.JSONDecodeError:
        print(f"    Invalid JSON response for {make} {model} {year}")
        return []
    except Exception as e:
        print(f"    Unexpected error for {make} {model} {year}: {e}")
        return []


# ── DATABASE ───────────────────────────────────────────────────

def create_database(db_path):
    """
    Create the SQLite database and complaints table if they
    don't already exist.

    The odi_number is the unique complaint ID from NHTSA.
    We use it as the primary key to prevent duplicates.
    """
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            odi_number      INTEGER PRIMARY KEY,
            make            TEXT NOT NULL,
            model           TEXT NOT NULL,
            model_year      INTEGER NOT NULL,
            manufacturer    TEXT,
            component       TEXT,
            summary         TEXT,
            date_incident   TEXT,
            date_filed      TEXT,
            crash           INTEGER DEFAULT 0,
            fire            INTEGER DEFAULT 0,
            num_injuries    INTEGER DEFAULT 0,
            num_deaths      INTEGER DEFAULT 0,
            fetched_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Index on make/model/year for fast dashboard queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_car
        ON complaints (make, model, model_year)
    """)

    # Index on component for grouping queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_component
        ON complaints (component)
    """)

    conn.commit()
    return conn


def save_complaints(conn, complaints, make, model, year):
    """
    Insert complaints into the database. Skips any complaint
    that already exists (based on odi_number primary key).

    Returns the number of NEW complaints inserted.
    """
    cursor = conn.cursor()
    new_count = 0

    for complaint in complaints:
        odi = complaint.get("odiNumber")
        if odi is None:
            continue

        try:
            cursor.execute("""
                INSERT OR IGNORE INTO complaints (
                    odi_number, make, model, model_year,
                    manufacturer, component, summary,
                    date_incident, date_filed,
                    crash, fire, num_injuries, num_deaths
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                odi,
                make,
                model,
                year,
                complaint.get("manufacturer", ""),
                complaint.get("components", ""),
                complaint.get("summary", ""),
                complaint.get("dateOfIncident", ""),
                complaint.get("dateComplaintFiled", ""),
                1 if complaint.get("crash") else 0,
                1 if complaint.get("fire") else 0,
                complaint.get("numberOfInjuries", 0),
                complaint.get("numberOfDeaths", 0),
            ))

            if cursor.rowcount > 0:
                new_count += 1

        except sqlite3.Error as e:
            print(f"    DB error for ODI {odi}: {e}")

    conn.commit()
    return new_count


# ── MAIN ───────────────────────────────────────────────────────

def run():
    """
    Main function. Loops through all German cars defined in
    config.py, fetches complaints from NHTSA, and stores them.
    """
    print("=" * 60)
    print("NHTSA Complaint Fetcher")
    print("=" * 60)

    # Figure out the database path relative to project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    db_path = os.path.join(project_root, DATABASE_PATH)

    print(f"\nDatabase: {db_path}")
    conn = create_database(db_path)

    # Count totals for the summary at the end
    total_new = 0
    total_fetched = 0
    total_requests = 0
    errors = 0

    # Calculate how many API calls we'll make
    num_models = sum(len(models) for models in GERMAN_CARS.values())
    num_years = END_YEAR - START_YEAR + 1
    total_expected = num_models * num_years
    print(f"Fetching complaints for {num_models} models across {num_years} years")
    print(f"Total API calls: {total_expected}")
    print(f"Estimated time: ~{int(total_expected * REQUEST_DELAY / 60)} minutes\n")

    for make, models in GERMAN_CARS.items():
        print(f"\n── {make} {'─' * (45 - len(make))}")

        for model in models:
            for year in range(START_YEAR, END_YEAR + 1):
                total_requests += 1

                # Progress indicator
                progress = f"[{total_requests}/{total_expected}]"
                print(f"  {progress} {make} {model} {year}", end="")

                # Fetch from NHTSA
                complaints = fetch_complaints(make, model, year)

                if complaints:
                    # Save to database
                    new = save_complaints(conn, complaints, make, model, year)
                    total_fetched += len(complaints)
                    total_new += new
                    print(f" ... {len(complaints)} complaints ({new} new)")
                else:
                    print(f" ... 0 complaints")

                # Be polite to the API
                time.sleep(REQUEST_DELAY)

    conn.close()

    # Final summary
    print("\n" + "=" * 60)
    print("DONE")
    print(f"  API calls made:      {total_requests}")
    print(f"  Complaints found:    {total_fetched}")
    print(f"  New records saved:   {total_new}")
    print(f"  Database location:   {db_path}")
    print("=" * 60)


if __name__ == "__main__":
    run()