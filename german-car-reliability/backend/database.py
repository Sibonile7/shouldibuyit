"""
Database layer for the German car reliability API.
"""

import os
import sqlite3


COMPONENT_CLEANUP = {
    "ENGINE AND ENGINE COOLING": "ENGINE", "SERVICE BRAKES": "BRAKES",
    "SERVICE BRAKES, HYDRAULIC": "BRAKES", "FUEL SYSTEM, GASOLINE": "FUEL SYSTEM",
    "FUEL/PROPULSION SYSTEM": "FUEL SYSTEM", "EXTERIOR LIGHTING": "LIGHTS",
    "FORWARD COLLISION AVOIDANCE": "SAFETY TECH",
    "ELECTRONIC STABILITY CONTROL (ESC)": "STABILITY CONTROL",
    "VEHICLE SPEED CONTROL": "ACCELERATION", "EQUIPMENT ADAPTIVE/MOBILITY": "EQUIPMENT",
    "LATCHES/LOCKS/LINKAGES": "LOCKS", "VISIBILITY/WIPER": "VISIBILITY",
    "UNKNOWN OR OTHER": "OTHER",
}


def get_db_path():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    return os.path.join(project_root, "data", "cars.db")


def get_connection():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def clean_component(raw):
    return COMPONENT_CLEANUP.get(raw.strip().upper(), raw.strip().upper())


def row_matches_component(raw_component, target_component):
    if not raw_component:
        return target_component == "OTHER"
    return any(clean_component(p) == target_component for p in raw_component.split(","))


def split_and_count_components(rows):
    counts = {}
    for row in rows:
        for part in (row["component"] or "OTHER").split(","):
            name = clean_component(part)
            counts[name] = counts.get(name, 0) + 1
    return sorted(counts.items(), key=lambda x: x[1], reverse=True)


def get_verdict(total_complaints, crashes, fires, injuries, recalls_count, worst_year, current_year):
    """
    Assign a Buy/Caution/Avoid verdict based on the data.

    Avoid: worst model year with serious issues, or fires+injuries pattern
    Caution: some crashes, fires, or high recall count
    Consider: low risk across the board
    """
    reasons = []
    is_worst = worst_year and worst_year["year"] == current_year

    # AVOID conditions
    if is_worst and (fires > 0 or injuries > 0 or crashes > 2):
        reasons.append("This is the worst model year for this car")
        if fires > 0:
            reasons.append(f"{fires} fire report{'s' if fires > 1 else ''}")
        if injuries > 0:
            reasons.append(f"{injuries} injur{'ies' if injuries > 1 else 'y'} reported")
        if crashes > 2:
            reasons.append(f"{crashes} crash{'es' if crashes > 1 else ''}")
        if recalls_count > 3:
            reasons.append(f"{recalls_count} recalls")
        return {"verdict": "avoid", "label": "Avoid this year", "reasons": reasons}

    if fires > 1 and crashes > 3:
        reasons.append(f"{fires} fire reports and {crashes} crashes")
        if recalls_count > 3:
            reasons.append(f"{recalls_count} recalls")
        return {"verdict": "avoid", "label": "Avoid this year", "reasons": reasons}

    # CAUTION conditions
    if crashes > 0 or fires > 0 or recalls_count >= 3 or total_complaints >= 20:
        if crashes > 0:
            reasons.append(f"{crashes} crash{'es' if crashes > 1 else ''} reported")
        if fires > 0:
            reasons.append(f"{fires} fire report{'s' if fires > 1 else ''}")
        if recalls_count >= 3:
            reasons.append(f"{recalls_count} active recalls")
        if total_complaints >= 50:
            reasons.append(f"{total_complaints} total complaints is above average")
        elif total_complaints >= 20:
            reasons.append(f"{total_complaints} complaints")
        if is_worst:
            reasons.append("This is the worst model year for this car")
        return {"verdict": "caution", "label": "Caution", "reasons": reasons}

    # CONSIDER (low risk)
    reasons.append("Low complaint count")
    if crashes == 0:
        reasons.append("Zero crashes")
    if fires == 0:
        reasons.append("Zero fires")
    if recalls_count == 0:
        reasons.append("No recalls")
    elif recalls_count <= 2:
        reasons.append(f"Only {recalls_count} recall{'s' if recalls_count > 1 else ''}")
    return {"verdict": "consider", "label": "Consider", "reasons": reasons}


def get_car_summary(make, model, year):
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

    cursor.execute("""
        SELECT summary, component, crash, fire, date_filed
        FROM complaints
        WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY date_filed DESC LIMIT 3
    """, (make.upper(), model.upper(), int(year)))

    samples = [{
        "summary": row["summary"][:300],
        "component": row["component"],
        "crash": bool(row["crash"]),
        "fire": bool(row["fire"]),
        "date_filed": row["date_filed"],
    } for row in cursor.fetchall()]

    worst_year = get_worst_year(make, model)
    verdict = get_verdict(total, crashes, fires, injuries, len(recalls), worst_year, int(year))

    conn.close()

    return {
        "make": make.upper(),
        "model": model.upper(),
        "year": int(year),
        "total_complaints": total,
        "top_issues": [{"component": c, "count": n} for c, n in top_issues[:10]],
        "severity": {"crashes": crashes, "fires": fires, "injuries": injuries, "deaths": deaths},
        "sample_complaints": samples,
        "recalls": recalls,
        "worst_year": worst_year,
        "verdict": verdict,
    }


def get_recalls_for_car(make, model, year):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='recalls'")
    if not cursor.fetchone():
        conn.close()
        return []
    cursor.execute("""
        SELECT campaign_number, component, summary, consequence, remedy,
               report_date, park_it, park_outside, ota_update, manufacturer
        FROM recalls WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY report_date DESC
    """, (make.upper(), model.upper(), int(year)))
    recalls = [{
        "campaign_number": r["campaign_number"], "component": r["component"],
        "summary": r["summary"], "consequence": r["consequence"],
        "remedy": r["remedy"], "report_date": r["report_date"],
        "park_it": bool(r["park_it"]), "park_outside": bool(r["park_outside"]),
        "ota_update": bool(r["ota_update"]), "manufacturer": r["manufacturer"],
    } for r in cursor.fetchall()]
    conn.close()
    return recalls


def get_complaints_by_component(make, model, year, component, limit=20, offset=0):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT odi_number, component, summary, crash, fire, num_injuries, num_deaths, date_filed
        FROM complaints WHERE make = ? AND model = ? AND model_year = ?
        ORDER BY date_filed DESC
    """, (make.upper(), model.upper(), int(year)))
    all_rows = cursor.fetchall()
    conn.close()

    if component.upper() == "ALL":
        matching = list(all_rows)
    else:
        matching = [r for r in all_rows if row_matches_component(r["component"], component.upper())]

    page = matching[offset:offset + limit]
    return {
        "component": component.upper(),
        "total_matching": len(matching),
        "offset": offset, "limit": limit,
        "has_more": (offset + limit) < len(matching),
        "complaints": [{
            "odi_number": r["odi_number"], "summary": r["summary"],
            "component": r["component"], "crash": bool(r["crash"]),
            "fire": bool(r["fire"]), "injuries": r["num_injuries"],
            "deaths": r["num_deaths"], "date_filed": r["date_filed"],
        } for r in page],
    }


def get_comparison(cars):
    return [s for s in (get_car_summary(m, mo, y) for m, mo, y in cars) if s]


def get_year_trend(make, model):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT model_year, COUNT(*) as complaint_count,
               SUM(crash) as crashes, SUM(fire) as fires, SUM(num_injuries) as injuries
        FROM complaints WHERE make = ? AND model = ?
        GROUP BY model_year ORDER BY model_year ASC
    """, (make.upper(), model.upper()))
    trend = [{"year": r["model_year"], "complaints": r["complaint_count"],
              "crashes": r["crashes"] or 0, "fires": r["fires"] or 0,
              "injuries": r["injuries"] or 0} for r in cursor.fetchall()]
    conn.close()
    return trend


def get_worst_year(make, model):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT model_year, COUNT(*) as cnt FROM complaints
        WHERE make = ? AND model = ? GROUP BY model_year ORDER BY cnt DESC
    """, (make.upper(), model.upper()))
    rows = cursor.fetchall()
    conn.close()
    if len(rows) < 3:
        return None
    worst = rows[0]
    avg_others = sum(r["cnt"] for r in rows[1:]) / len(rows[1:])
    if avg_others == 0:
        return None
    ratio = worst["cnt"] / avg_others
    if ratio >= 2.0:
        return {"year": worst["model_year"], "complaints": worst["cnt"],
                "avg_other_years": round(avg_others, 1), "ratio": round(ratio, 1)}
    return None


def get_available_makes():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT make FROM complaints ORDER BY make")
    r = [row["make"] for row in cursor.fetchall()]
    conn.close()
    return r


def get_available_models(make):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT model FROM complaints WHERE make = ? ORDER BY model", (make.upper(),))
    r = [row["model"] for row in cursor.fetchall()]
    conn.close()
    return r


def get_available_years(make, model):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT model_year FROM complaints WHERE make = ? AND model = ? ORDER BY model_year DESC", (make.upper(), model.upper()))
    r = [row["model_year"] for row in cursor.fetchall()]
    conn.close()
    return r


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
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='recalls'")
    if cursor.fetchone():
        cursor.execute("SELECT COUNT(*) as total FROM recalls")
        total_recalls = cursor.fetchone()["total"]
    conn.close()
    return {"total_complaints": total, "total_recalls": total_recalls, "total_makes": makes, "total_models": models}


def get_top_reliable_cars(w_complaints=1.0, w_crashes=3.0, w_fires=5.0, w_injuries=4.0,
                          w_recalls=2.0, year_min=2010, year_max=2024, min_complaints=5,
                          limit=10, make_filter=None):
    conn = get_connection()
    cursor = conn.cursor()
    if make_filter and make_filter.upper() != "ALL":
        cursor.execute("""
            SELECT make, model, model_year, COUNT(*) as complaint_count,
                   SUM(crash) as crashes, SUM(fire) as fires, SUM(num_injuries) as injuries
            FROM complaints WHERE model_year BETWEEN ? AND ? AND make = ?
            GROUP BY make, model, model_year HAVING complaint_count >= ?
        """, (int(year_min), int(year_max), make_filter.upper(), int(min_complaints)))
    else:
        cursor.execute("""
            SELECT make, model, model_year, COUNT(*) as complaint_count,
                   SUM(crash) as crashes, SUM(fire) as fires, SUM(num_injuries) as injuries
            FROM complaints WHERE model_year BETWEEN ? AND ?
            GROUP BY make, model, model_year HAVING complaint_count >= ?
        """, (int(year_min), int(year_max), int(min_complaints)))

    cars = [{"make": r["make"], "model": r["model"], "year": r["model_year"],
             "complaints": r["complaint_count"], "crashes": r["crashes"] or 0,
             "fires": r["fires"] or 0, "injuries": r["injuries"] or 0, "recalls": 0}
            for r in cursor.fetchall()]

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='recalls'")
    if cursor.fetchone():
        cursor.execute("""
            SELECT make, model, model_year, COUNT(*) as recall_count
            FROM recalls WHERE model_year BETWEEN ? AND ? GROUP BY make, model, model_year
        """, (int(year_min), int(year_max)))
        rl = {(r["make"], r["model"], r["model_year"]): r["recall_count"] for r in cursor.fetchall()}
        for car in cars:
            car["recalls"] = rl.get((car["make"], car["model"], car["year"]), 0)
    conn.close()

    if not cars:
        return []

    for car in cars:
        car["raw_penalty"] = (car["complaints"] * w_complaints + car["crashes"] * w_crashes +
                              car["fires"] * w_fires + car["injuries"] * w_injuries + car["recalls"] * w_recalls)

    mn = min(c["raw_penalty"] for c in cars)
    mx = max(c["raw_penalty"] for c in cars)
    rng = mx - mn if mx > mn else 1
    for car in cars:
        car["reliability_score"] = round(100 - ((car["raw_penalty"] - mn) / rng) * 100, 1)

    cars.sort(key=lambda c: c["reliability_score"], reverse=True)
    return cars[:int(limit)]