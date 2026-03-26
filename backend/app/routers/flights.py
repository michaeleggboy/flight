from fastapi import APIRouter

from app.models.flight import FlightSearchRequest, FlightOption
from app.services.flight_service import search_flights, list_airports, get_airport

router = APIRouter(prefix="/api/flights", tags=["flights"])


@router.get("/airports")
async def get_airports():
    """List all supported airports."""
    return list_airports()


@router.get("/airports/{code}")
async def get_airport_by_code(code: str):
    """Get airport details by IATA code."""
    airport = get_airport(code)
    if not airport:
        return {"error": f"Airport {code} not found"}
    return airport


@router.post("/search", response_model=list[FlightOption])
async def search(request: FlightSearchRequest):
    """Search flights between two airports."""
    return await search_flights(request)
