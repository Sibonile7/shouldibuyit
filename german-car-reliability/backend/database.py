"""
Database layer for the German car reliability API.

Handles SQLite connection and all queries for complaints, recalls,
and the reliability ranking system.
"""

import os
import sqlite3


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
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    return os.path.join(project_root, "data", "cars.db")


def get_connection():
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def clean_component(raw):
    raw = raw.strip().upper()
    return COMPONENT_CLEANUP.get(raw, raw)


def row_matches_component(raw_component, target_component):
    if not raw_component:
        return target_component == "OTHER"
    parts = raw_component.split(",")
    for part in parts:
        if clean_component(part) == target_component:
            return True
    return False


def split_and_count_components(rows):
    counts = {}
    for row in rows:
        raw = row["component"] or "OTHER"
        parts = raw.split(",")
        for part in parts:
            name = clean_component(part)
            counts[name] = counts.get(name, 0) + 1
    return sorted(counts.items(), key=lambda x: x[1], reverse=True)


def get_car_summary(make, model, year):
    """Get complaint summary + recalls for a specific car."""
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

    recalls = get_recalls_for_car(make, model, year)

    if total == 0 and len(recalls) == 0:
        conn.close()
        return None

    top_issues = split_and_count_components(rows) if rows else []

    crashes = sum(1 for r in rows if r["crash"])
    fires = sum(1 for r in rows if r["fire"])
    injuries = sum(r["num_injuries"] for r in rows)
    deaths = sum(r["num_deaths"] for r in rows)

    # Only show first 3 complaints by default (user can load more)
    cursor.execute("""
        SELECT summary, component, crash, fire, date_filed
        FROM complaints
        WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY date_filed DESC
        LIMIT 3
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
        "recalls": recalls,
    }


def get_recalls_for_car(make, model, year):
    """Get all recalls for a specific car."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='recalls'
    """)
    if not cursor.fetchone():
        conn.close()
        return []

    cursor.execute("""
        SELECT campaign_number, component, summary, consequence, remedy,
               report_date, park_it, park_outside, ota_update, manufacturer
        FROM recalls
        WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY report_date DESC
    """, (make.upper(), model.upper(), int(year)))

    recalls = []
    for row in cursor.fetchall():
        recalls.append({
            "campaign_number": row["campaign_number"],
            "component": row["component"],
            "summary": row["summary"],
            "consequence": row["consequence"],
            "remedy": row["remedy"],
            "report_date": row["report_date"],
            "park_it": bool(row["park_it"]),
            "park_outside": bool(row["park_outside"]),
            "ota_update": bool(row["ota_update"]),
            "manufacturer": row["manufacturer"],
        })

    conn.close()
    return recalls


def get_complaints_by_component(make, model, year, component, limit=20, offset=0):
    """Get complaints for a car filtered by component, or all if component is 'ALL'."""
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

    # If component is "ALL", return everything (no filter)
    if component.upper() == "ALL":
        matching = list(all_rows)
    else:
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
    results = []
    for make, model, year in cars:
        summary = get_car_summary(make, model, year)
        if summary:
            results.append(summary)
    return results


def get_available_makes():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT make FROM complaints ORDER BY make")
    makes = [row["make"] for row in cursor.fetchall()]
    conn.close()
    return makes


def get_available_models(make):
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
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total FROM complaints")
    total = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(DISTINCT make) as makes FROM complaints")
    makes = cursor.fetchone()["makes"]
    cursor.execute("SELECT COUNT(DISTINCT model) as models FROM complaints")
    models = cursor.fetchone()["models"]

    total_recalls = 0
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='recalls'
    """)
    if cursor.fetchone():
        cursor.execute("SELECT COUNT(*) as total FROM recalls")
        total_recalls = cursor.fetchone()["total"]

    conn.close()
    return {
        "total_complaints": total,
        "total_recalls": total_recalls,
        "total_makes": makes,
        "total_models": models,
    }


def get_top_reliable_cars(
    w_complaints=1.0,
    w_crashes=3.0,
    w_fires=5.0,
    w_injuries=4.0,
    w_recalls=2.0,
    year_min=2010,
    year_max=2024,
    min_complaints=5,
    limit=10,
):
    """
    Rank cars by reliability score using weighted penalty formula.
    Score = 100 - normalized_penalty. Higher is better.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT make, model, model_year,
               COUNT(*) as complaint_count,
               SUM(crash) as crashes,
               SUM(fire) as fires,
               SUM(num_injuries) as injuries
        FROM complaints
        WHERE model_year BETWEEN ? AND ?
        GROUP BY make, model, model_year
        HAVING complaint_count >= ?
    """, (int(year_min), int(year_max), int(min_complaints)))

    cars = []
    for row in cursor.fetchall():
        cars.append({
            "make": row["make"],
            "model": row["model"],
            "year": row["model_year"],
            "complaints": row["complaint_count"],
            "crashes": row["crashes"] or 0,
            "fires": row["fires"] or 0,
            "injuries": row["injuries"] or 0,
            "recalls": 0,
        })

    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='recalls'
    """)
    if cursor.fetchone():
        cursor.execute("""
            SELECT make, model, model_year, COUNT(*) as recall_count
            FROM recalls
            WHERE model_year BETWEEN ? AND ?
            GROUP BY make, model, model_year
        """, (int(year_min), int(year_max)))
        recall_lookup = {
            (row["make"], row["model"], row["model_year"]): row["recall_count"]
            for row in cursor.fetchall()
        }
        for car in cars:
            key = (car["make"], car["model"], car["year"])
            car["recalls"] = recall_lookup.get(key, 0)

    conn.close()

    if not cars:
        return []

    for car in cars:
        car["raw_penalty"] = (
            car["complaints"] * w_complaints
            + car["crashes"] * w_crashes
            + car["fires"] * w_fires
            + car["injuries"] * w_injuries
            + car["recalls"] * w_recalls
        )

    min_penalty = min(c["raw_penalty"] for c in cars)
    max_penalty = max(c["raw_penalty"] for c in cars)
    penalty_range = max_penalty - min_penalty if max_penalty > min_penalty else 1

    for car in cars:
        normalized = ((car["raw_penalty"] - min_penalty) / penalty_range) * 100
        car["reliability_score"] = round(100 - normalized, 1)

    cars.sort(key=lambda c: c["reliability_score"], reverse=True)
    return cars[:int(limit)]