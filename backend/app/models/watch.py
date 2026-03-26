from pydantic import BaseModel, Field


class LegWatchRequest(BaseModel):
    origin: str = Field(..., description="Origin IATA code")
    destination: str = Field(..., description="Destination IATA code")
    date: str = Field(..., description="Departure date YYYY-MM-DD")
    days_left: int | None = Field(
        default=None,
        ge=0,
        le=365,
        description="Override days until departure (else computed from date)",
    )
    current_price_usd: float | None = Field(
        default=None,
        gt=0,
        description="Override observed price (else cheapest mock search result)",
    )


class WatchRecommendation(BaseModel):
    action: str = Field(..., description="WAIT or BUY")
    confidence: float = Field(..., ge=0.0, le=1.0)
    route_key: str
    days_left: int
    current_price_usd: float
    reference_price_usd: float
    disclaimer: str = Field(
        default="Trained on a simulated price process and mock fares—not real market data.",
    )
    debug: dict | None = None


class WatchTrainRoute(BaseModel):
    origin: str
    destination: str


class WatchTrainRequest(BaseModel):
    routes: list[WatchTrainRoute] = Field(
        default_factory=list,
        description="Routes to train; if empty, trains a small default set of hub pairs",
    )
    episodes: int = Field(default=2500, ge=100, le=50_000)


class WatchTrainResponse(BaseModel):
    trained: list[str]
    episodes: int
    message: str
