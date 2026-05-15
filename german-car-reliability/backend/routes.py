"""
API routes for the German car reliability dashboard.

Endpoints:
    GET /api/car/{make}/{model}/{year}              - Complaint summary + recalls
    GET /api/car/{make}/{model}/{year}/component/{component}  - Filter by component
    GET /api/compare                                - Side-by-side
    GET /api/top                                    - NEW: Ranked top reliable cars
    GET /api/makes                                  - List makes
    GET /api/models/{make}                          - List models
    GET /api/years/{make}/{model}                   - List years
    GET /api/stats                                  - Database stats
"""

from fastapi import APIRouter, HTTPException, Query

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import (
    get_car_summary,
    get_complaints_by_component,
    get_comparison,
    get_top_reliable_cars,
    get_available_makes,
    get_available_models,
    get_available_years,
    get_stats,
)

router = APIRouter(prefix="/api")


@router.get("/car/{make}/{model}/{year}")
def car_summary(make: str, model: str, year: int):
    """Get complaint summary and recalls for a specific car."""
    result = get_car_summary(make, model, year)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for {make} {model} {year}"
        )
    return result


@router.get("/car/{make}/{model}/{year}/component/{component}")
def complaints_by_component(
    make: str,
    model: str,
    year: int,
    component: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Get complaints filtered by component."""
    result = get_complaints_by_component(
        make, model, year, component, limit=limit, offset=offset
    )
    if result["total_matching"] == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No {component} complaints found for {make} {model} {year}"
        )
    return result


@router.get("/compare")
def compare_cars(cars: str = Query(...)):
    """Compare multiple cars side by side."""
    car_list = []
    for car_str in cars.split(","):
        parts = car_str.strip().split("/")
        if len(parts) != 3:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid car format: '{car_str}'. Use MAKE/MODEL/YEAR"
            )
        make, model, year = parts
        try:
            year = int(year)
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"Invalid year: '{year}'"
            )
        car_list.append((make, model, year))

    if len(car_list) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 cars")
    if len(car_list) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 cars")

    results = get_comparison(car_list)
    if not results:
        raise HTTPException(status_code=404, detail="No data found")
    return results


@router.get("/top")
def top_reliable_cars(
    w_complaints: float = Query(1.0, ge=0, le=10),
    w_crashes: float = Query(3.0, ge=0, le=10),
    w_fires: float = Query(5.0, ge=0, le=10),
    w_injuries: float = Query(4.0, ge=0, le=10),
    w_recalls: float = Query(2.0, ge=0, le=10),
    year_min: int = Query(2010, ge=2010, le=2024),
    year_max: int = Query(2024, ge=2010, le=2024),
    min_complaints: int = Query(5, ge=1),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Return top N most reliable cars based on weighted scoring.

    Default weights prioritize safety (fires, crashes, injuries weighted higher
    than raw complaint count). User can adjust via query parameters to focus on
    different criteria (e.g. set w_complaints=10 for "fewest total issues").
    """
    if year_min > year_max:
        raise HTTPException(
            status_code=400, detail="year_min must be ≤ year_max"
        )

    results = get_top_reliable_cars(
        w_complaints=w_complaints,
        w_crashes=w_crashes,
        w_fires=w_fires,
        w_injuries=w_injuries,
        w_recalls=w_recalls,
        year_min=year_min,
        year_max=year_max,
        min_complaints=min_complaints,
        limit=limit,
    )
    return {
        "count": len(results),
        "weights": {
            "complaints": w_complaints,
            "crashes": w_crashes,
            "fires": w_fires,
            "injuries": w_injuries,
            "recalls": w_recalls,
        },
        "filters": {
            "year_min": year_min,
            "year_max": year_max,
            "min_complaints": min_complaints,
        },
        "cars": results,
    }


@router.get("/makes")
def list_makes():
    return get_available_makes()


@router.get("/models/{make}")
def list_models(make: str):
    models = get_available_models(make)
    if not models:
        raise HTTPException(status_code=404, detail=f"No models for {make}")
    return models


@router.get("/years/{make}/{model}")
def list_years(make: str, model: str):
    years = get_available_years(make, model)
    if not years:
        raise HTTPException(status_code=404, detail=f"No years")
    return years


@router.get("/stats")
def database_stats():
    return get_stats()