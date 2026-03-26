import { motion, useReducedMotion } from 'framer-motion';
import { DollarSign, Clock } from 'lucide-react';

export default function TradeoffSlider({ alpha, onChange }) {
  const reduceMotion = useReducedMotion();
  const hint =
    alpha < 0.3
      ? 'Prioritizing fastest routes'
      : alpha > 0.7
        ? 'Prioritizing cheapest flights'
        : 'Balanced price & time';

  return (
    <div className="space-y-3">
      <label
        id="tradeoff-alpha-label"
        htmlFor="tradeoff-alpha"
        className="text-sm font-medium text-white/60 uppercase tracking-wider"
      >
        Optimize For
      </label>

      <div className="glass rounded-lg p-4 space-y-3 border border-white/6">
        <div className="flex items-center justify-between text-sm gap-2">
          <div className="flex items-center gap-1.5 text-accent-cyan shrink-0">
            <Clock size={14} aria-hidden />
            <span>Speed</span>
          </div>
          <div className="font-mono text-white/50 text-xs tabular-nums shrink-0">
            α = {alpha.toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 text-accent-magenta shrink-0">
            <span>Price</span>
            <DollarSign size={14} aria-hidden />
          </div>
        </div>

        <input
          id="tradeoff-alpha"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={alpha}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={alpha}
          aria-valuetext={
            alpha < 0.3 ? 'Prioritize speed' : alpha > 0.7 ? 'Prioritize price' : 'Balanced price and time'
          }
          aria-labelledby="tradeoff-alpha-label"
          aria-describedby="tradeoff-alpha-hint"
        />

        <motion.p
          id="tradeoff-alpha-hint"
          key={alpha}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="text-xs text-center text-white/45"
        >
          {hint}
        </motion.p>
      </div>
    </div>
  );
}
