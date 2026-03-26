# ✈️ FlightPath — Multi-City Flight Optimizer

A full-stack flight route optimizer that finds the best price-to-time tradeoff across multi-city itineraries, visualized on an interactive **3D globe** (great-circle routes, ranked results, and a floating trip builder panel).

## Preview

<p align="center">
  <img src="docs/readme-preview.png" alt="FlightPath UI: 3D globe with flight arcs and trip builder panel" width="920" />
</p>

<p align="center">
  <em>Representative UI mockup. Replace with a screen recording or GIF if you prefer—see <a href="#replacing-the-preview-media">Replacing the preview media</a>.</em>
</p>

## Architecture

```
┌─────────────────────────────────────┐
│          React Frontend             │
│  3D globe (react-globe.gl)          │
│  Floating trip panel · α slider     │
└──────────────┬──────────────────────┘
               │ REST API
┌──────────────▼──────────────────────┐
│         FastAPI Backend             │
│  ┌─────────────────────────────┐    │
│  │   Route Optimizer (TSP)     │    │
│  │   - Brute force (≤8 cities) │    │
│  │   - Simulated annealing     │    │
│  └─────────────┬───────────────┘    │
│  ┌─────────────▼───────────────┐    │
│  │   Flight Data Service       │    │
│  │   - Amadeus API / mock data │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │   RL Price Watch            │    │
│  │   - Tabular Q (simulator)   │    │
│  │   - POST /api/watch/*       │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Features

- **Multi-city route optimization** — round trip, multi-city, or flexible ordering
- **Price-to-time tradeoff slider** — adjust α to prioritize cost vs speed
- **Globe visualization** — photoreal **Blue Marble** surface ([react-globe.gl](https://github.com/vasturiano/react-globe.gl) layers: arcs, points, labels, rings, polygons, HTML markers; see [Globe visualization](#globe-visualization-react-globegl) below)
- **Itinerary ranking** — top routes scored and compared
- **RL price watch** — per-route tabular Q-learning on **simulated** price paths; `POST /api/watch/recommend` (buy/wait + confidence) and `POST /api/watch/train` to refresh Q-tables under `backend/data/q_tables/`. **Not** real market data—see response `disclaimer`.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion, [react-globe.gl](https://github.com/vasturiano/react-globe.gl) / Three.js, TanStack Query
- **Backend**: Python 3.11+, FastAPI, Pydantic
- **Optimizer**: itertools (exact), simulated annealing (heuristic)
- **Flight data**: Amadeus API or in-process mock flights (`USE_MOCK_DATA`)

## Globe visualization (react-globe.gl)

The map is implemented in [`frontend/src/components/MapView.jsx`](frontend/src/components/MapView.jsx) with **[react-globe.gl](https://github.com/vasturiano/react-globe.gl)** (Three.js / WebGL). Prop and layer names match the **[official API reference](https://github.com/vasturiano/react-globe.gl?tab=readme-ov-file)**.

### Globe surface and scene

| Concept | react-globe.gl props | This project |
|--------|----------------------|--------------|
| Equirectangular texture | `globeImageUrl`, `bumpImageUrl` | [Blue Marble](https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg) + topology bump (three-globe examples) |
| Custom shading | `globeMaterial` | `MeshPhongMaterial` — colors in [`frontend/src/theme/tokens.js`](frontend/src/theme/tokens.js) (`globeTokens`) tuned for a bright satellite base |
| Atmosphere halo | `showAtmosphere` (default on), `atmosphereColor`, `atmosphereAltitude` | Soft sky-blue rim; altitude `0.18`. A custom **starfield** (Three.js `Points` on a distant sphere) sits in the same scene for depth around the globe — see below. |
| Lat/lng grid | `showGraticules` | Enabled |
| Lights | `onGlobeReady` → `globe.lights([...])` | Ambient + directional “daylight” (see `globeTokens`) |

### Data layers (same names as the library docs)

| Layer | Key props | How we use it |
|-------|-----------|----------------|
| **Polygons** | `polygonsData`, `polygonGeoJsonGeometry`, `polygonCapColor`, `polygonSideColor`, `polygonStrokeColor`, `polygonAltitude` | [Natural Earth](https://www.naturalearthdata.com/) 110m countries (`public/geo/ne_110m_admin_0_countries.geojson`) for land/coast context over the photoreal globe |
| **Points** | `pointsData`, `pointLat`, `pointLng`, `pointAltitude`, `pointRadius`, `pointColor`, `pointLabel`, `onPointClick`, … | Full airport network as **warm red** dots (`globeTokens.pointPool`); **cyan** origin and **amber** other stops on the active trip; slightly larger radii so markers read over Blue Marble. Tooltips and click/right-click to build the route |
| **Labels** | `labelsData`, `labelLat`, `labelLng`, `labelText`, `labelColor`, `labelSize`, `labelAltitude`, … | Macro regions / cities from [`macroGlobeLabels.json`](frontend/src/data/macroGlobeLabels.json) (hidden when zoomed in via `onZoom`) plus route labels `1·IATA`, … |
| **Arcs** | `arcsData`, `arcStartLat`/`Lng`/`Altitude`, `arcEnd*`, `arcColor`, `arcStroke`, `arcDashLength`, `arcDashGap`, `arcDashAnimateTime`, `arcAltitudeAutoScale`, … | Great-circle **itinerary legs** (score- and leg-order-colored) or **draft** segments between picked cities |
| **Rings** | `ringsData`, `ringLat`, `ringLng`, `ringAltitude`, `ringMaxRadius`, `ringPropagationSpeed`, `ringRepeatPeriod`, `ringColor` | Ripple pulses at each **route** airport (stronger on origin) |
| **HTML elements** | `htmlElementsData`, `htmlLat`, `htmlLng`, `htmlAltitude`, `htmlElement` | Small **leg index** badges (1, 2, …) positioned along arcs |

### Custom Three.js (not a react-globe prop)

Following the **[Clouds example](https://github.com/vasturiano/react-globe.gl/tree/master/example/clouds)** in the same repo, a slightly larger **cloud sphere** (`TextureLoader` + `requestAnimationFrame` rotation) is added in `onGlobeReady`. It respects **`prefers-reduced-motion`**.

A **starfield** is added the same way: thousands of `THREE.Points` on a large-radius shell (`createStarfieldPoints` in `MapView.jsx`), additive blending, color from `globeTokens.starField`, so stars read as sky around Earth outside the library’s atmosphere mesh.

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Add your API keys
uvicorn app.main:app --reload --port 8000
```

**Tests:** `PYTHONPATH=. pytest tests/ -v` from `backend/`.

**Price watch (optional):** call `POST /api/watch/train` once (empty body trains a default hub subset), then `POST /api/watch/recommend` with `{ "origin": "BOS", "destination": "LHR", "date": "2026-07-15" }`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Environment Variables

### Backend `.env`

```
AMADEUS_API_KEY=your_key
AMADEUS_API_SECRET=your_secret
USE_MOCK_DATA=true          # Set false to use real Amadeus API
```

### Frontend `.env`

```
VITE_API_BASE_URL=http://localhost:8000
```

## Project Structure

```
flight/
├── docs/
│   └── readme-preview.png       # README hero image (optional: add demo.gif)
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── config.py            # Settings & env vars
│   │   ├── routers/
│   │   │   ├── flights.py       # /api/flights endpoints
│   │   │   ├── optimize.py      # /api/optimize endpoints
│   │   │   └── watch.py         # /api/watch/recommend, /train
│   │   ├── services/
│   │   │   ├── flight_service.py    # Amadeus API / mock data
│   │   │   ├── optimizer.py         # TSP route optimizer
│   │   │   ├── scorer.py            # Price-time scoring
│   │   │   ├── price_simulator.py   # Simulated price paths (RL training)
│   │   │   └── q_price_agent.py     # Tabular Q-learning buy/wait
│   │   └── models/
│   │       ├── flight.py        # Pydantic models
│   │       ├── itinerary.py     # Route/itinerary models
│   │       └── watch.py         # Watch request/response models
│   ├── data/
│   │   └── q_tables/            # Persisted Q matrices (JSON)
│   ├── tests/                   # pytest
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root layout & trip panel
│   │   ├── main.jsx             # Entry point
│   │   ├── components/
│   │   │   ├── MapView.jsx      # react-globe.gl: Blue Marble, arcs, labels, rings, …
│   │   │   ├── CitySearch.jsx   # Autocomplete city input
│   │   │   ├── ItineraryPanel.jsx   # Route results
│   │   │   ├── TradeoffSlider.jsx   # α slider
│   │   │   └── FlightCard.jsx       # Per-leg flight info
│   │   ├── hooks/
│   │   │   └── useOptimizer.js  # API hook
│   │   ├── utils/
│   │   │   ├── geo.js           # Great-circle math
│   │   │   └── formatApiError.js
│   │   ├── theme/
│   │   │   └── tokens.js
│   │   ├── data/
│   │   │   └── macroGlobeLabels.json
│   │   └── styles/
│   │       └── index.css        # Global styles
│   ├── public/
│   │   └── geo/
│   │       └── ne_110m_admin_0_countries.geojson
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── .env.example
├── README.md
└── .impeccable.md               # UI design notes (optional)
```

## Replacing the preview media

To use a **screen recording** or **GIF** instead of (or in addition to) the static image:

1. Capture the running app (e.g. macOS Screenshot / QuickTime, or [Kap](https://getkap.co/) for GIF).
2. Save as `docs/demo.gif` (or `.mp4` on GitHub you can link in Releases or host elsewhere).
3. In this README, add below the screenshot, for example:

```markdown
![FlightPath demo](docs/demo.gif)
```

For **YouTube or Loom**, use a normal markdown link or thumbnail image linking to the video URL.

## Future Enhancements

- RL-based price watch agent (Q-learning per leg, simulator-trained)
- Historical price chart per route
- Airport alternatives (e.g., BOS vs PVD)
- Layover quality scoring
- User accounts & saved trips

