import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Trophy, Route, DollarSign, Clock } from 'lucide-react';
import FlightCard from './FlightCard';
import { formatDuration, formatPrice } from '../utils/geo';

function formatOptimizationMethod(method) {
  if (!method) return 'optimized';
  return String(method).replace(/_/g, ' ');
}

function ItineraryRow({ itinerary, isSelected, onSelect }) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const isTop = itinerary.rank === 1;

  const rowEnter = reduceMotion
    ? { initial: false, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: itinerary.rank * 0.05, ease: [0.25, 1, 0.5, 1], duration: 0.28 },
      };

  const scoreValue = ((1 - itinerary.total_score) * 100).toFixed(0);

  return (
    <motion.div
      {...rowEnter}
      className={`
        glass rounded-xl overflow-hidden transition-shadow duration-200 ease-out
        ${isSelected ? 'glow-cyan border-accent-cyan/30' : ''}
        ${isTop ? 'ring-1 ring-accent-cyan/25' : ''}
      `}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`Route ${itinerary.rank}, total ${formatPrice(itinerary.total_price_usd ?? 0)}. ${expanded ? 'Collapse' : 'Expand'} leg details.`}
        className="w-full p-4 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors duration-200 ease-out"
        onClick={() => {
          onSelect(itinerary.id);
          setExpanded(!expanded);
        }}
      >
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
            ${isTop
              ? 'bg-accent-cyan/15 text-accent-cyan'
              : 'bg-white/5 text-white/45'
            }
          `}
        >
          {isTop ? <Trophy size={16} aria-hidden /> : `#${itinerary.rank}`}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm font-mono text-white/75 truncate">
            {itinerary.city_order.map((code, i) => (
              <span key={`${code}-${i}`} className="flex items-center gap-1 shrink-0">
                {i > 0 && <span className="text-white/25" aria-hidden>→</span>}
                <span className={i === 0 ? 'text-accent-cyan' : ''}>{code}</span>
              </span>
            ))}
          </div>
          <div className="text-xs text-white/45 mt-0.5">
            {itinerary.legs.length} legs · {formatOptimizationMethod(itinerary.optimization_method)}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-sm shrink-0">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-accent-emerald font-mono font-medium tabular-nums">
              <DollarSign size={12} className="opacity-80" aria-hidden />
              {formatPrice(itinerary.total_price_usd).replace('$', '')}
            </div>
            <div className="flex items-center justify-end gap-1 text-white/45 text-xs mt-0.5 tabular-nums">
              <Clock size={10} aria-hidden />
              {formatDuration(itinerary.total_duration_minutes)}
            </div>
          </div>

          <div className="text-right w-12 sm:w-14">
            <div
              className="text-lg font-bold tabular-nums text-accent-cyan drop-shadow-[0_0_12px_rgba(0,212,255,0.2)]"
              aria-label={`Score ${scoreValue} out of 100`}
            >
              {scoreValue}
            </div>
            <div className="text-[10px] text-white/45 uppercase tracking-wider">score</div>
          </div>

          <span
            className={`text-white/45 shrink-0 transition-transform duration-200 ease-out ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden
          >
            <ChevronDown size={18} />
          </span>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-white/6 p-4 space-y-2 bg-midnight/20">
            {itinerary.legs.map((leg, idx) => (
              <FlightCard
                key={leg.flight?.id ?? `leg-${itinerary.id}-${idx}`}
                leg={leg}
                index={idx}
                reduceStagger={reduceMotion}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ItineraryPanel({ results, selectedId, onSelectItinerary }) {
  if (!results) {
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium text-white/60 uppercase tracking-wider">Routes</div>
        <div className="glass rounded-xl p-6 text-center border border-white/6">
          <Route size={28} className="mx-auto text-accent-cyan/20 mb-3" aria-hidden />
          <p className="text-white/45 text-sm leading-relaxed">
            Add at least two cities, then run <span className="text-white/60">Find Best Routes</span> to see
            ranked itineraries here.
          </p>
        </div>
      </div>
    );
  }

  const { itineraries, alpha, optimization_method } = results;

  if (itineraries.length === 0) {
    return (
      <div className="glass rounded-xl p-6 text-center border border-white/6">
        <Route size={32} className="mx-auto text-accent-amber/30 mb-2" aria-hidden />
        <p className="text-white/50 text-sm">No routes found. Try different cities or dates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white/60 uppercase tracking-wider">Routes</div>
        <span className="text-xs text-white/45 font-mono tabular-nums text-right">
          {formatOptimizationMethod(optimization_method)} · α={alpha.toFixed(2)}
        </span>
      </div>

      <div className="space-y-2">
        {itineraries.map((it) => (
          <ItineraryRow
            key={it.id}
            itinerary={it}
            isSelected={selectedId === it.id}
            onSelect={onSelectItinerary}
          />
        ))}
      </div>
    </div>
  );
}
