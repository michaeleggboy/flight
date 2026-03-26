import json
import random
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

from app.config import get_settings
from app.models.flight import FlightOption, Airport, FlightSearchRequest

# ─── Airport database (expandable) ───────────────────────────────────────────

AIRPORTS: dict[str, Airport] = {
    "BOS": Airport(code="BOS", name="Logan International", city="Boston", lat=42.3656, lng=-71.0096),
    "JFK": Airport(code="JFK", name="John F. Kennedy International", city="New York", lat=40.6413, lng=-73.7781),
    "LAX": Airport(code="LAX", name="Los Angeles International", city="Los Angeles", lat=33.9416, lng=-118.4085),
    "ORD": Airport(code="ORD", name="O'Hare International", city="Chicago", lat=41.9742, lng=-87.9073),
    "LHR": Airport(code="LHR", name="Heathrow", city="London", lat=51.4700, lng=-0.4543),
    "CDG": Airport(code="CDG", name="Charles de Gaulle", city="Paris", lat=49.0097, lng=2.5479),
    "NRT": Airport(code="NRT", name="Narita International", city="Tokyo", lat=35.7720, lng=140.3929),
    "FCO": Airport(code="FCO", name="Leonardo da Vinci", city="Rome", lat=41.8003, lng=12.2389),
    "SFO": Airport(code="SFO", name="San Francisco International", city="San Francisco", lat=37.6213, lng=-122.3790),
    "MIA": Airport(code="MIA", name="Miami International", city="Miami", lat=25.7959, lng=-80.2870),
    "DXB": Airport(code="DXB", name="Dubai International", city="Dubai", lat=25.2532, lng=55.3657),
    "SIN": Airport(code="SIN", name="Changi", city="Singapore", lat=1.3644, lng=103.9915),
    "ATL": Airport(code="ATL", name="Hartsfield-Jackson", city="Atlanta", lat=33.6407, lng=-84.4277),
    "DEN": Airport(code="DEN", name="Denver International", city="Denver", lat=39.8561, lng=-104.6737),
    "SEA": Airport(code="SEA", name="Seattle-Tacoma", city="Seattle", lat=47.4502, lng=-122.3088),
    "ICN": Airport(code="ICN", name="Incheon International", city="Seoul", lat=37.4602, lng=126.4407),
    "GRU": Airport(code="GRU", name="Guarulhos", city="São Paulo", lat=-23.4356, lng=-46.4731),
    "SYD": Airport(code="SYD", name="Kingsford Smith", city="Sydney", lat=-33.9461, lng=151.1772),
    "CUN": Airport(code="CUN", name="Cancún International", city="Cancún", lat=21.0365, lng=-86.8771),
}

AIRLINES = [
    "Delta", "United", "American", "JetBlue", "Southwest",
    "British Airways", "Air France", "Lufthansa", "Emirates",
    "Japan Airlines", "Singapore Airlines", "LATAM",
]


def get_airport(code: str) -> Airport | None:
    return AIRPORTS.get(code.upper())


def list_airports() -> list[Airport]:
    return list(AIRPORTS.values())


# ─── Mock flight generator ───────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km."""
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _generate_mock_flights(
    origin: Airport,
    destination: Airport,
    date: str,
    n: int = 5,
) -> list[FlightOption]:
    """Generate realistic-ish mock flights between two airports."""
    dist_km = _haversine_km(origin.lat, origin.lng, destination.lat, destination.lng)

    # Rough flight time: ~800 km/h cruise + 45min overhead
    base_minutes = int(dist_km / 800 * 60) + 45

    # Rough base price: $0.08-0.12/km
    base_price = dist_km * random.uniform(0.08, 0.12)

    # Seed for reproducibility per route+date
    seed_str = f"{origin.code}-{destination.code}-{date}"
    seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    flights = []
    for i in range(n):
        # Vary departure time throughout the day
        hour = rng.choice([6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 20, 22])
        minute = rng.choice([0, 15, 30, 45])
        departure = datetime.fromisoformat(f"{date}T{hour:02d}:{minute:02d}:00")

        # Stops: longer flights more likely to have stops
        stops = 0
        if dist_km > 5000:
            stops = rng.choices([0, 1, 2], weights=[0.3, 0.5, 0.2])[0]
        elif dist_km > 2000:
            stops = rng.choices([0, 1], weights=[0.7, 0.3])[0]

        # Duration varies with stops
        duration = int(base_minutes * rng.uniform(0.9, 1.15))
        if stops > 0:
            duration += stops * rng.randint(60, 150)  # layover time

        arrival = departure + timedelta(minutes=duration)

        # Price varies: direct flights cost more, early/late cheaper
        price_mult = rng.uniform(0.75, 1.5)
        if stops == 0 and dist_km > 3000:
            price_mult *= 1.2
        if hour < 7 or hour > 21:
            price_mult *= 0.85
        price = round(base_price * price_mult, 2)

        airline = rng.choice(AIRLINES)

        flight_id = f"{airline[:2].upper()}{rng.randint(100,9999)}-{origin.code}{destination.code}-{i}"

        flights.append(
            FlightOption(
                id=flight_id,
                origin=origin,
                destination=destination,
                airline=airline,
                departure=departure,
                arrival=arrival,
                duration_minutes=duration,
                price_usd=price,
                stops=stops,
            )
        )

    # Sort by price
    flights.sort(key=lambda f: f.price_usd)
    return flights


# ─── Public API ──────────────────────────────────────────────────────────────

async def search_flights(request: FlightSearchRequest) -> list[FlightOption]:
    """Search for flights. Uses mock data or Amadeus API based on config."""
    settings = get_settings()

    origin = get_airport(request.origin)
    destination = get_airport(request.destination)

    if not origin or not destination:
        return []

    if settings.use_mock_data:
        return _generate_mock_flights(origin, destination, request.date)

    # TODO: Implement real Amadeus API call
    # from amadeus import Client, ResponseError
    # amadeus = Client(
    #     client_id=settings.amadeus_api_key,
    #     client_secret=settings.amadeus_api_secret,
    # )
    # try:
    #     response = amadeus.shopping.flight_offers_search.get(
    #         originLocationCode=request.origin,
    #         destinationLocationCode=request.destination,
    #         departureDate=request.date,
    #         adults=request.passengers,
    #     )
    #     return _parse_amadeus_response(response.data)
    # except ResponseError as e:
    #     raise HTTPException(status_code=502, detail=str(e))

    return _generate_mock_flights(origin, destination, request.date)
