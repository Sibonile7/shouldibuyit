"""
Database layer for the German car reliability API.

Handles SQLite connection and all queries.
Normalizes NHTSA's multi-component fields into
individual components for clean ranking.

Example: "ENGINE AND ENGINE COOLING,ELECTRICAL SYSTEM"
becomes two separate counts: one for ENGINE, one for ELECTRICAL SYSTEM.
"""

import os
import sqlite3


# Mapping of raw NHTSA component strings to clean names.
# NHTSA uses verbose names like "ENGINE AND ENGINE COOLING"
# which we shorten for the dashboard.
COMPONENT_CLEANUP = {
    "ENGINE AND ENGINE COOLING": "ENGINE",
    "SERVICE BRAKES": "BRAKES",
    "SERVICE BRAKES, HYDRAULIC": "BRAKES",
    "FUEL SYSTEM, GASOLINE": "FUEL SYSTEM",
    "FUEL/PROPULSION SYSTEM": "FUEL SYSTEM",
    "EXTERIOR LIGHTING": "LIGHTS",
    "FORWARD COLLISION AVOIDANCE": "SAFETY TECH",
    "ELECTRONIC STABILITY CONTROL (ESC)": "STABILITY CONTROL",
    "VEHICLE SPEED CONTROL": "ACCELERATION",
    "EQUIPMENT ADAPTIVE/MOBILITY": "EQUIPMENT",
    "LATCHES/LOCKS/LINKAGES": "LOCKS",
    "VISIBILITY/WIPER": "VISIBILITY",
    "UNKNOWN OR OTHER": "OTHER",
}


def get_db_path():
    """Find the database relative to the project root."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    return os.path.join(project_root, "data", "cars.db")


def get_connection():
    """Create a database connection with row factory."""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def clean_component(raw):
    """Clean up a single component name."""
    raw = raw.strip().upper()
    return COMPONENT_CLEANUP.get(raw, raw)


def row_matches_component(raw_component, target_component):
    """
    Check if a complaint's raw component string matches a clean target.

    NHTSA stores "ENGINE AND ENGINE COOLING,ELECTRICAL SYSTEM" as one
    field. If the user clicks "ELECTRICAL SYSTEM" we need to match that
    even though it's mixed with engine in the raw string.
    """
    if not raw_component:
        return target_component == "OTHER"
    parts = raw_component.split(",")
    for part in parts:
        if clean_component(part) == target_component:
            return True
    return False


def split_and_count_components(rows):
    """
    Take raw complaint rows and split multi-component fields.
    Returns a sorted list of (component, count) tuples.
    """
    counts = {}
    for row in rows:
        raw = row["component"] or "OTHER"
        parts = raw.split(",")
        for part in parts:
            name = clean_component(part)
            counts[name] = counts.get(name, 0) + 1

    return sorted(counts.items(), key=lambda x: x[1], reverse=True)


def get_car_summary(make, model, year):
    """Get complaint summary for a specific car."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT component, summary, crash, fire, num_injuries, num_deaths,
               date_incident, date_filed
        FROM complaints
        WHERE make = ? AND model = ? AND model_year = ?
    """, (make.upper(), model.upper(), int(year)))

    rows = cursor.fetchall()
    total = len(rows)

    if total == 0:
        conn.close()
        return None

    top_issues = split_and_count_components(rows)

    crashes = sum(1 for r in rows if r["crash"])
    fires = sum(1 for r in rows if r["fire"])
    injuries = sum(r["num_injuries"] for r in rows)
    deaths = sum(r["num_deaths"] for r in rows)

    cursor.execute("""
        SELECT summary, component, crash, fire, date_filed
        FROM complaints
        WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY date_filed DESC
        LIMIT 5
    """, (make.upper(), model.upper(), int(year)))

    samples = []
    for row in cursor.fetchall():
        samples.append({
            "summary": row["summary"][:300],
            "component": row["component"],
            "crash": bool(row["crash"]),
            "fire": bool(row["fire"]),
            "date_filed": row["date_filed"],
        })

    conn.close()

    return {
        "make": make.upper(),
        "model": model.upper(),
        "year": int(year),
        "total_complaints": total,
        "top_issues": [
            {"component": comp, "count": count}
            for comp, count in top_issues[:10]
        ],
        "severity": {
            "crashes": crashes,
            "fires": fires,
            "injuries": injuries,
            "deaths": deaths,
        },
        "sample_complaints": samples,
    }


def get_complaints_by_component(make, model, year, component, limit=20, offset=0):
    """
    Get all complaints for a car, filtered by a clean component name.

    Used when user clicks a bar in the dashboard to see complaints
    for that specific component (e.g. only ENGINE complaints).

    Returns dict with complaints list, total matching, and pagination info.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT odi_number, component, summary, crash, fire,
               num_injuries, num_deaths, date_filed
        FROM complaints
        WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY date_filed DESC
    """, (make.upper(), model.upper(), int(year)))

    all_rows = cursor.fetchall()
    conn.close()

    # Filter by component (in Python, since NHTSA strings are messy)
    matching = [
        row for row in all_rows
        if row_matches_component(row["component"], component.upper())
    ]

    total_matching = len(matching)
    page = matching[offset:offset + limit]

    complaints = []
    for row in page:
        complaints.append({
            "odi_number": row["odi_number"],
            "summary": row["summary"],
            "component": row["component"],
            "crash": bool(row["crash"]),
            "fire": bool(row["fire"]),
            "injuries": row["num_injuries"],
            "deaths": row["num_deaths"],
            "date_filed": row["date_filed"],
        })

    return {
        "component": component.upper(),
        "total_matching": total_matching,
        "offset": offset,
        "limit": limit,
        "has_more": (offset + limit) < total_matching,
        "complaints": complaints,
    }


def get_comparison(cars):
    """Compare multiple cars side by side."""
    results = []
    for make, model, year in cars:
        summary = get_car_summary(make, model, year)
        if summary:
            results.append(summary)
    return results


def get_available_makes():
    """List all makes in the database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT make FROM complaints ORDER BY make")
    makes = [row["make"] for row in cursor.fetchall()]
    conn.close()
    return makes


def get_available_models(make):
    """List all models for a given make."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT model FROM complaints
        WHERE make = ?
        ORDER BY model
    """, (make.upper(),))
    models = [row["model"] for row in cursor.fetchall()]
    conn.close()
    return models


def get_available_years(make, model):
    """List all years for a given make/model."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT model_year FROM complaints
        WHERE make = ? AND model = ?
        ORDER BY model_year DESC
    """, (make.upper(), model.upper()))
    years = [row["model_year"] for row in cursor.fetchall()]
    conn.close()
    return years


def get_stats():
    """Get overall database statistics."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM complaints")
    total = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(DISTINCT make) as makes FROM complaints")
    makes = cursor.fetchone()["makes"]
    cursor.execute("SELECT COUNT(DISTINCT model) as models FROM complaints")
    models = cursor.fetchone()["models"]
    conn.close()
    return {
        "total_complaints": total,
        "total_makes": makes,
        "total_models": models,
    }