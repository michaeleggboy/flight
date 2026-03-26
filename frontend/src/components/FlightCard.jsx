import { motion } from 'framer-motion';
import { Plane, Clock } from 'lucide-react';
import { formatDuration, formatPrice } from '../utils/geo';

export default function FlightCard({ leg, index, reduceStagger = false }) {
  const { flight } = leg;

  const depTime = new Date(flight.departure).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const arrTime = new Date(flight.arrival).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const stagger = reduceStagger
    ? { initial: false, animate: { opacity: 1, x: 0 } }
    : {
        initial: { opacity: 0, x: -8 },
        animate: { opacity: 1, x: 0 },
        transition: { delay: index * 0.06, ease: [0.25, 1, 0.5, 1], duration: 0.22 },
      };

  return (
    <motion.div
      {...stagger}
      className="glass glass-hover rounded-lg p-3 space-y-2 transition-shadow duration-200 ease-out"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Plane size={14} className="text-accent-cyan shrink-0" aria-hidden />
          <span className="text-sm font-medium text-white/90 truncate">{flight.airline}</span>
        </div>
        <span className="font-mono text-xs text-white/45 shrink-0">{flight.id?.split('-')[0]}</span>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <div className="text-center shrink-0 w-[3.25rem] sm:w-14">
          <div className="font-medium text-white/90 tabular-nums">{depTime}</div>
          <div className="font-mono text-xs text-accent-cyan">{flight.origin.code}</div>
        </div>

        <div className="flex-1 flex items-center gap-1 min-w-0">
          <div className="flex-1 h-px bg-white/12" />
          <div className="flex items-center gap-1 text-xs text-white/45 tabular-nums shrink-0 px-1">
            <Clock size={10} aria-hidden />
            {formatDuration(flight.duration_minutes)}
          </div>
          <div className="flex-1 h-px bg-white/12" />
        </div>

        <div className="text-center shrink-0 w-[3.25rem] sm:w-14">
          <div className="font-medium text-white/90 tabular-nums">{arrTime}</div>
          <div className="font-mono text-xs text-accent-cyan">{flight.destination.code}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs gap-2">
        <div className="text-white/45 min-w-0">
          {flight.stops === 0 ? 'Direct' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
        </div>
        <div className="font-mono font-medium text-accent-emerald tabular-nums shrink-0">
          {formatPrice(flight.price_usd)}
        </div>
      </div>
    </motion.div>
  );
}
