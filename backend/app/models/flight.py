from pydantic import BaseModel
from datetime import datetime


class Airport(BaseModel):
    code: str  # IATA code e.g. "BOS"
    name: str
    city: str
    lat: float
    lng: float


class FlightOption(BaseModel):
    id: str
    origin: Airport
    destination: Airport
    airline: str
    departure: datetime
    arrival: datetime
    duration_minutes: int
    price_usd: float
    stops: int
    cabin_class: str = "economy"


class FlightSearchRequest(BaseModel):
    origin: str  # IATA code
    destination: str  # IATA code
    date: str  # YYYY-MM-DD
    passengers: int = 1
