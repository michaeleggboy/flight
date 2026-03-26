from fastapi import APIRouter

from app.models.itinerary import OptimizeRequest, OptimizeResponse
from app.services.optimizer import optimize_route

router = APIRouter(prefix="/api/optimize", tags=["optimize"])


@router.post("/", response_model=OptimizeResponse)
async def optimize(request: OptimizeRequest):
    """
    Optimize a multi-city flight itinerary.
    
    Returns ranked itineraries based on the price-to-time tradeoff (alpha).
    """
    return await optimize_route(request)
