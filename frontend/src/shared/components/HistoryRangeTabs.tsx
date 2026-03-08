import { useEffect, useState } from 'react';
import { cn, getStoredHistoryRange, HISTORY_RANGE_OPTIONS, setStoredHistoryRange, type HistoryRange } from '../utils';

interface HistoryRangeTabsProps {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
  coverageLabel?: string;
  showMixedCadenceNote?: boolean;
  className?: string;
}

export function useHistoryRange(storageKey = 'history-range') {
  const [range, setRange] = useState<HistoryRange>(() => getStoredHistoryRange(storageKey));

  useEffect(() => {
    setStoredHistoryRange(range, storageKey);
  }, [range, storageKey]);

  return [range, setRange] as const;
}

export function HistoryRangeTabs({
  value,
  onChange,
  coverageLabel,
  showMixedCadenceNote = false,
  className,
}: HistoryRangeTabsProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {HISTORY_RANGE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-[11px] font-semibold uppercase tracking-widest transition-colors',
                value === option.value
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/[0.03] border-white/10 text-white/50 hover:text-white hover:border-white/20'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {coverageLabel && (
          <span className="inline-flex items-center self-start sm:self-auto px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] text-[10px] font-medium uppercase tracking-wider text-white/65">
            {coverageLabel}
          </span>
        )}
      </div>

      {showMixedCadenceNote && value === 'ALL' && (
        <p className="text-[10px] text-white/55">
          All mixes monthly history with current-year daily updates, so point density increases near the right edge.
        </p>
      )}
    </div>
  );
}
