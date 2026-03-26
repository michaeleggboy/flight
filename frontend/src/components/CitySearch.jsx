import { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MapPin, X, Plus } from 'lucide-react';

const LISTBOX_ID = 'city-search-listbox';

export default function CitySearch({
  airports = [],
  airportsLoading = false,
  airportsBlocked = false,
  selectedCities,
  onAddCity,
  onRemoveCity,
  /** Header bar: full-width search, visually minimal chrome */
  compact = false,
}) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);

  const filtered = useMemo(
    () =>
      airports.filter(
        (a) =>
          !selectedCities.includes(a.code) &&
          (a.city.toLowerCase().includes(deferredQuery.toLowerCase()) ||
            a.code.toLowerCase().includes(deferredQuery.toLowerCase()) ||
            a.name.toLowerCase().includes(deferredQuery.toLowerCase()))
      ),
    [airports, selectedCities, deferredQuery]
  );

  const options = useMemo(() => filtered.slice(0, 8), [filtered]);

  useEffect(() => {
    if (options.length === 0) {
      setActiveIdx(-1);
      return;
    }
    setActiveIdx((i) => (i < 0 ? 0 : Math.min(i, options.length - 1)));
  }, [options]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (airport) => {
    onAddCity(airport.code);
    setQuery('');
    setIsOpen(false);
    setActiveIdx(-1);
  };

  const listVisible = isOpen && query.length > 0 && options.length > 0 && !airportsBlocked;

  const onInputKeyDown = (e) => {
    if (airportsLoading || airportsBlocked) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!listVisible) {
        setIsOpen(true);
        return;
      }
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!listVisible) return;
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (listVisible && activeIdx >= 0 && options[activeIdx]) {
        e.preventDefault();
        handleSelect(options[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  };

  const chipMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.92 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.92 },
        transition: { type: 'tween', duration: 0.18, ease: [0.25, 1, 0.5, 1] },
      };

  const dropdownMotion = reduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
      };

  const placeholder = airportsBlocked
    ? 'Airports unavailable'
    : airportsLoading
      ? 'Loading airports…'
      : compact
        ? 'Search city or airport code…'
        : 'Add a city…';

  const ddZ = compact ? 'z-[200]' : 'z-50';

  return (
    <div className={`space-y-2 ${compact ? 'w-full' : ''}`}>
      <label
        htmlFor="city-search-input"
        className={compact ? 'sr-only' : 'text-sm font-medium text-white/60 uppercase tracking-wider'}
      >
        {compact ? 'Search cities to add to your trip' : 'Cities'}
      </label>

      <div className="relative" ref={inputRef}>
        <div
          className={`flex items-center gap-2 glass rounded-lg px-3 py-2.5 min-h-[44px] transition-opacity duration-200 ${
            airportsLoading || airportsBlocked ? 'opacity-55' : ''
          } ${compact ? 'border border-white/10 shadow-lg shadow-black/20' : ''}`}
        >
          <Plus size={16} className="text-accent-cyan/70 shrink-0" aria-hidden />
          <input
            id="city-search-input"
            type="text"
            role="combobox"
            aria-expanded={listVisible}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              listVisible && activeIdx >= 0 ? `city-opt-${activeIdx}` : undefined
            }
            value={query}
            disabled={airportsLoading || airportsBlocked}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            className="bg-transparent text-white placeholder:text-white/40 outline-none flex-1 text-sm min-w-0 rounded disabled:cursor-not-allowed focus-visible:ring-0 focus-visible:ring-offset-0"
            autoComplete="off"
            aria-busy={airportsLoading}
            aria-describedby={airportsLoading ? 'city-search-status' : undefined}
          />
        </div>

        <AnimatePresence>
          {listVisible && (
            <motion.div
              {...dropdownMotion}
              id={LISTBOX_ID}
              role="listbox"
              aria-label="Matching cities"
              className={`absolute top-full left-0 right-0 mt-1 glass rounded-lg overflow-hidden ${ddZ} max-h-52 overflow-y-auto shadow-xl shadow-black/40 border border-white/10`}
            >
              {options.map((airport, i) => (
                <div
                  key={airport.code}
                  role="option"
                  id={`city-opt-${i}`}
                  aria-selected={activeIdx === i}
                  tabIndex={-1}
                  className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] cursor-pointer transition-colors duration-150 ease-out ${
                    activeIdx === i ? 'bg-accent-cyan/12 text-white' : 'hover:bg-white/5'
                  }`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(airport)}
                >
                  <MapPin size={14} className="text-accent-cyan/70 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white/90">{airport.city}</span>
                    <span className="text-xs text-white/45 ml-2 break-words">{airport.name}</span>
                  </div>
                  <span className="font-mono text-xs text-accent-cyan/85 shrink-0">{airport.code}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {airportsLoading && (
        <p id="city-search-status" className="text-xs text-white/45">
          Loading airport list…
        </p>
      )}

      {selectedCities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence mode="popLayout">
            {selectedCities.map((code, idx) => {
              const airport = airports.find((a) => a.code === code);
              const isOrigin = idx === 0;
              return (
                <motion.div
                  key={code}
                  layout
                  {...chipMotion}
                  className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
                  ${isOrigin
                    ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
                    : 'bg-white/5 text-white/85 border border-white/10'
                  }
                `}
                >
                  <MapPin size={14} className="text-current opacity-80" aria-hidden />
                  <span className="truncate max-w-[10rem] sm:max-w-[12rem]">{airport?.city || code}</span>
                  <span className="text-white/45 font-mono text-xs shrink-0">{code}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveCity(code)}
                    className="ml-0.5 -mr-0.5 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md hover:text-accent-magenta hover:bg-white/5 transition-colors duration-150 ease-out"
                    aria-label={`Remove ${airport?.city || code} (${code}) from trip`}
                  >
                    <X size={14} />
                  </button>
                  {isOrigin && (
                    <span className="text-[10px] uppercase tracking-wider text-accent-cyan/70 shrink-0">
                      origin
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {selectedCities.length >= 2 && (
        <p className="text-xs text-white/45">
          First city is your origin & return. {selectedCities.length - 1} destination
          {selectedCities.length - 1 > 1 ? 's' : ''} selected.
        </p>
      )}
    </div>
  );
}
