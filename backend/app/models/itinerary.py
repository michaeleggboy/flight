from pydantic import BaseModel, Field
from app.models.flight import FlightOption, Airport


class OptimizeRequest(BaseModel):
    cities: list[str]  # List of IATA codes, first = origin/return
    dates: list[str]  # Flexible dates per leg (YYYY-MM-DD)
    alpha: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Tradeoff weight: 0=optimize time, 1=optimize price",
    )
    trip_type: str = Field(
        default="flexible",
        description="round_trip | multi_city | flexible",
    )
    passengers: int = 1
    max_results: int = 5


class LegResult(BaseModel):
    flight: FlightOption
    leg_score: float  # Combined score for this leg


class ItineraryResult(BaseModel):
    id: str
    legs: list[LegResult]
    city_order: list[str]  # IATA codes in visit order
    total_price_usd: float
    total_duration_minutes: int
    total_score: float  # Lower = better
    rank: int


class OptimizeResponse(BaseModel):
    itineraries: list[ItineraryResult]
    alpha: float
    cities_searched: list[str]
    optimization_method: str  # "exact" or "heuristic"
