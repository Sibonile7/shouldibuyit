"""
API routes for the German car reliability dashboard.

Endpoints:
    GET /api/car/{make}/{model}/{year}  - Complaint summary for one car
    GET /api/compare                    - Side-by-side comparison
    GET /api/makes                      - List available makes
    GET /api/models/{make}              - List models for a make
    GET /api/years/{make}/{model}       - List years for a make/model
    GET /api/stats                      - Database statistics
"""

from fastapi import APIRouter, HTTPException, Query

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import (
    get_car_summary,
    get_comparison,
    get_available_makes,
    get_available_models,
    get_available_years,
    get_stats,
)

router = APIRouter(prefix="/api")


@router.get("/car/{make}/{model}/{year}")
def car_summary(make: str, model: str, year: int):
    """
    Get complaint summary for a specific car.

    Example: /api/car/BMW/328I/2014

    Returns top issues ranked by frequency,
    severity data, and sample complaint summaries.
    """
    result = get_car_summary(make, model, year)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No complaints found for {make} {model} {year}"
        )
    return result


@router.get("/compare")
def compare_cars(cars: str = Query(
    ...,
    description="Comma-separated list of cars as MAKE/MODEL/YEAR",
    example="BMW/328I/2014,MERCEDES-BENZ/C-CLASS/2014"
)):
    """
    Compare multiple cars side by side.

    Example: /api/compare?cars=BMW/328I/2014,MERCEDES-BENZ/C-CLASS/2014

    Accepts 2-4 cars separated by commas.
    Each car is formatted as MAKE/MODEL/YEAR.
    """
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
                status_code=400,
                detail=f"Invalid year: '{year}'"
            )
        car_list.append((make, model, year))

    if len(car_list) < 2:
        raise HTTPException(
            status_code=400,
            detail="Need at least 2 cars to compare"
        )
    if len(car_list) > 4:
        raise HTTPException(
            status_code=400,
            detail="Maximum 4 cars per comparison"
        )

    results = get_comparison(car_list)
    if not results:
        raise HTTPException(
            status_code=404,
            detail="No complaints found for any of the specified cars"
        )
    return results


@router.get("/makes")
def list_makes():
    """List all available car makes in the database."""
    return get_available_makes()


@router.get("/models/{make}")
def list_models(make: str):
    """List all available models for a given make."""
    models = get_available_models(make)
    if not models:
        raise HTTPException(
            status_code=404,
            detail=f"No models found for {make}"
        )
    return models


@router.get("/years/{make}/{model}")
def list_years(make: str, model: str):
    """List all available years for a given make/model."""
    years = get_available_years(make, model)
    if not years:
        raise HTTPException(
            status_code=404,
            detail=f"No years found for {make} {model}"
        )
    return years


@router.get("/stats")
def database_stats():
    """Get overall database statistics."""
    return get_stats()