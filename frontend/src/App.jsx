import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  Plane,
  Loader2,
  Calendar,
  Users,
  Shuffle,
  ArrowRightLeft,
  Route,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import CitySearch from './components/CitySearch';
import TradeoffSlider from './components/TradeoffSlider';
import ItineraryPanel from './components/ItineraryPanel';
import { useAirports, useOptimize } from './hooks/useOptimizer';
import { formatApiError } from './utils/formatApiError';

const MapView = lazy(() => import('./components/MapView'));

function MapLoadingFallback() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-midnight"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-9 w-9 animate-spin text-accent-cyan/50" aria-hidden />
      <p className="text-sm text-white/45">Loading globe…</p>
      <span className="sr-only">Loading interactive globe</span>
    </div>
  );
}

const TRIP_TYPES = [
  { value: 'round_trip', label: 'Round Trip', icon: ArrowRightLeft },
  { value: 'multi_city', label: 'Multi-City', icon: Route },
  { value: 'flexible', label: 'Flexible Order', icon: Shuffle },
];

export default function App() {
  const [selectedCities, setSelectedCities] = useState([]);
  const [alpha, setAlpha] = useState(0.5);
  const [tripType, setTripType] = useState('flexible');
  const [date, setDate] = useState('2026-07-15');
  const [passengers, setPassengers] = useState(1);
  const [selectedItineraryId, setSelectedItineraryId] = useState(null);
  const [tripPanelOpen, setTripPanelOpen] = useState(true);

  const {
    data: airports = [],
    isLoading: airportsLoading,
    isError: airportsError,
    error: airportsFetchError,
    refetch: refetchAirports,
  } = useAirports();
  const optimize = useOptimize();

  const handleAddCity = (code) => {
    if (!selectedCities.includes(code)) {
      setSelectedCities([...selectedCities, code]);
    }
  };

  const handleRemoveCity = (code) => {
    setSelectedCities(selectedCities.filter((c) => c !== code));
    setSelectedItineraryId(null);
    optimize.reset();
  };

  /** Globe: left-click toggles trip; right-click moves airport to origin (first in list). */
  const handleGlobeAirportPick = useCallback(
    (code, { asOrigin = false } = {}) => {
      setSelectedItineraryId(null);
      optimize.reset();
      if (asOrigin) {
        setSelectedCities((cur) => {
          const rest = cur.filter((c) => c !== code);
          return [code, ...rest];
        });
        return;
      }
      setSelectedCities((cur) => {
        if (cur.includes(code)) return cur.filter((c) => c !== code);
        return [...cur, code];
      });
    },
    [optimize]
  );

  const handleOptimize = () => {
    if (selectedCities.length < 2) return;
    setSelectedItineraryId(null);
    optimize.mutate({
      cities: selectedCities,
      dates: [date],
      alpha,
      tripType,
      passengers,
    });
  };

  const selectedItinerary = useMemo(() => {
    if (!optimize.data || !selectedItineraryId) return null;
    return optimize.data.itineraries.find((it) => it.id === selectedItineraryId) || null;
  }, [optimize.data, selectedItineraryId]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden w-full">
      <header className="shrink-0 z-50 relative border-b border-white/8 bg-midnight/90 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-[1600px] mx-auto space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
            <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
              <div className="w-9 h-9 rounded-lg bg-accent-cyan/10 flex items-center justify-center ring-1 ring-accent-cyan/15">
                <Plane size={18} className="text-accent-cyan" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                  FlightPath
                </h1>
                <p className="text-[11px] sm:text-xs text-white/45 hidden sm:block">
                  Multi-city flight optimizer
                </p>
              </div>
            </div>
            <div className="flex-1 min-w-0 w-full">
              <CitySearch
                compact
                airports={airports}
                airportsLoading={airportsLoading}
                airportsBlocked={airportsError}
                selectedCities={selectedCities}
                onAddCity={handleAddCity}
                onRemoveCity={handleRemoveCity}
              />
            </div>
          </div>
        </div>
      </header>

      <div
        className={`relative flex-1 min-h-0 w-full overflow-hidden ${
          tripPanelOpen ? 'md:flex md:flex-row md:gap-3 md:px-3 md:pt-3 md:min-h-0' : ''
        }`}
      >
        <main
          aria-label="Route map"
          className={`z-0 min-h-0 absolute inset-0 ${
            tripPanelOpen
              ? 'md:relative md:inset-auto md:flex md:flex-col md:flex-1 md:min-w-0 md:min-h-0'
              : ''
          }`}
        >
          <Suspense fallback={<MapLoadingFallback />}>
            <MapView
              edgeToEdge
              airports={airports}
              selectedCities={selectedCities}
              selectedItinerary={selectedItinerary}
              tripType={tripType}
              onGlobeAirportPick={handleGlobeAirportPick}
            />
          </Suspense>
        </main>

        <aside
          aria-label="Trip builder and route results"
          className={`pointer-events-none flex flex-col gap-2 absolute z-40 top-3 right-3 sm:top-4 sm:right-4 items-end
            ${tripPanelOpen ? 'md:relative md:top-auto md:right-auto md:z-auto md:shrink-0 md:items-stretch md:self-stretch md:min-h-0' : ''}`}
        >
          {!tripPanelOpen && (
            <button
              type="button"
              onClick={() => setTripPanelOpen(true)}
              className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-midnight/85 backdrop-blur-xl text-accent-cyan shadow-lg shadow-black/50 ring-1 ring-white/5 hover:bg-midnight/95 hover:border-white/18 transition-colors duration-200"
              title="Show trip panel"
            >
              <ChevronLeft size={22} strokeWidth={2} aria-hidden />
              <span className="sr-only">Show trip panel</span>
            </button>
          )}

          {tripPanelOpen && (
          <div
            id="trip-side-panel"
            role="region"
            aria-labelledby="trip-side-panel-title"
            className="pointer-events-auto flex h-full min-h-0 w-[min(380px,calc(100vw-1.5rem))] max-h-[min(520px,calc(100dvh-5.25rem))] md:max-h-[calc(100dvh-5.25rem)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-midnight/80 backdrop-blur-xl shadow-2xl shadow-black/60 ring-1 ring-white/5"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
              <h2
                id="trip-side-panel-title"
                className="text-xs font-semibold uppercase tracking-wider text-white/50"
              >
                Trip builder
              </h2>
              <button
                type="button"
                onClick={() => setTripPanelOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/55 hover:text-white/90 hover:bg-white/8 transition-colors duration-200"
                title="Hide trip panel"
              >
                <ChevronRight size={20} strokeWidth={2} aria-hidden />
                <span className="sr-only">Hide trip panel</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 sm:pb-5 space-y-5 sm:space-y-6 [scrollbar-gutter:stable]">
          {airportsError && (
            <div
              className="rounded-lg border border-accent-amber/30 bg-accent-amber/8 px-3 py-2.5 text-sm text-accent-amber/95 flex flex-col gap-2"
              role="alert"
            >
              <p>{formatApiError(airportsFetchError, 'Could not load airports.')}</p>
              <button
                type="button"
                onClick={() => refetchAirports()}
                className="self-start text-xs font-semibold uppercase tracking-wider text-accent-cyan hover:text-accent-cyan/80 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-medium text-white/60 uppercase tracking-wider" id="trip-type-label">
              Trip Type
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-labelledby="trip-type-label"
            >
              {TRIP_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={tripType === value}
                  key={value}
                  onClick={() => setTripType(value)}
                  className={`
                    glass rounded-lg px-3 py-2.5 min-h-[44px] text-xs font-medium flex flex-col items-center justify-center gap-1.5
                    transition-colors duration-200 ease-out
                    ${tripType === value
                      ? 'border-accent-cyan/35 text-accent-cyan bg-accent-cyan/8 ring-1 ring-accent-cyan/20'
                      : 'text-white/45 hover:text-white/65 hover:bg-white/5'
                    }
                  `}
                >
                  <Icon size={16} className={tripType === value ? 'text-accent-cyan' : 'text-white/40'} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="trip-date" className="text-sm font-medium text-white/60 uppercase tracking-wider">
                Date
              </label>
              <div className="glass rounded-lg px-3 py-2.5 min-h-[44px] flex items-center gap-2 transition-colors duration-200 ease-out">
                <Calendar size={14} className="text-white/40 shrink-0" aria-hidden />
                <input
                  id="trip-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-sm text-white/90 outline-none flex-1 min-w-0 rounded"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="trip-pax" className="text-sm font-medium text-white/60 uppercase tracking-wider">
                Pax
              </label>
              <div className="glass rounded-lg px-3 py-2.5 min-h-[44px] flex items-center gap-2 transition-colors duration-200 ease-out">
                <Users size={14} className="text-white/40 shrink-0" aria-hidden />
                <select
                  id="trip-pax"
                  value={passengers}
                  onChange={(e) => setPassengers(parseInt(e.target.value, 10))}
                  className="bg-transparent text-sm text-white/90 outline-none flex-1 min-w-0 rounded cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n} className="bg-slate-850">
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <TradeoffSlider alpha={alpha} onChange={setAlpha} />

          <motion.button
            type="button"
            whileHover={
              selectedCities.length >= 2 && !optimize.isPending && !airportsLoading && !airportsError
                ? { scale: 1.01 }
                : undefined
            }
            whileTap={
              selectedCities.length >= 2 && !optimize.isPending && !airportsLoading && !airportsError
                ? { scale: 0.98 }
                : undefined
            }
            onClick={handleOptimize}
            disabled={
              selectedCities.length < 2 || optimize.isPending || airportsLoading || airportsError
            }
            className={`
              w-full py-3 min-h-[48px] rounded-xl font-semibold text-sm uppercase tracking-wider
              transition-shadow duration-200 ease-out flex items-center justify-center gap-2
              ${selectedCities.length < 2 || airportsLoading || airportsError
                ? 'bg-white/5 text-white/25 cursor-not-allowed'
                : 'bg-gradient-to-r from-accent-cyan to-accent-emerald text-midnight hover:shadow-lg hover:shadow-accent-cyan/25'
              }
              ${optimize.isPending ? 'cursor-wait' : ''}
            `}
          >
            {optimize.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Plane size={16} />
                Find Best Routes
              </>
            )}
          </motion.button>

          {optimize.isError && (
            <div
              className="rounded-lg border border-accent-magenta/25 bg-accent-magenta/5 px-3 py-2 text-sm text-accent-magenta/95"
              role="alert"
            >
              {formatApiError(optimize.error, 'Could not optimize routes. Check the API and try again.')}
            </div>
          )}

          <ItineraryPanel
            results={optimize.data}
            selectedId={selectedItineraryId}
            onSelectItinerary={setSelectedItineraryId}
          />
            </div>
          </div>
          )}
        </aside>
      </div>
    </div>
  );
}
