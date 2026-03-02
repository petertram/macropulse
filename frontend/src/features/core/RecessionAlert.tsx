import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, TrendingUp, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function RecessionAlert({ onNavigate }: { onNavigate?: (model: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Simulate real-time alert trigger after 4 seconds
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-20 right-4 md:right-8 z-50 w-[calc(100%-2rem)] md:w-[420px] bg-[#1a1500] border border-amber-500/30 rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 text-amber-500">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-bold text-sm tracking-wide uppercase">Model Alert: Regime Shift</span>
              </div>
              <button 
                onClick={() => setIsVisible(false)} 
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-white/80 text-sm mb-4 leading-relaxed">
              Recession Probability Model has spiked from <span className="text-white font-semibold">42.1%</span> to <span className="text-amber-400 font-bold">68.5%</span> over the last 72 hours, crossing the critical threshold.
            </p>

            <div className="bg-black/40 rounded-lg p-4 border border-white/5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">AI Allocation Advice</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-white/70 leading-relaxed">
                    <strong className="text-white/90">Bonds:</strong> Increase duration. 10Y Treasuries are historically the strongest ballast during this specific transition phase.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-white/70 leading-relaxed">
                    <strong className="text-white/90">Equities:</strong> Reduce high-beta exposure. Rotate into defensive sectors (Utilities, Staples) and high-quality balance sheets.
                  </p>
                </div>
              </div>
            </div>

            {onNavigate && (
              <button 
                onClick={() => {
                  onNavigate('recession');
                  setIsVisible(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium rounded-lg transition-colors border border-amber-500/20"
              >
                View Recession Model
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="h-1 w-full bg-amber-500/20">
            <motion.div 
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 15, ease: "linear" }}
              onAnimationComplete={() => setIsVisible(false)}
              className="h-full bg-amber-500"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
