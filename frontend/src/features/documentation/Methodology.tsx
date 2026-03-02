import React from 'react';
import { BookOpen, Activity, TrendingUp, AlertTriangle, Zap, ArrowRightLeft, MessageSquare, BarChart2, PieChart, ShieldAlert } from 'lucide-react';

export default function Methodology() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="w-8 h-8 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">Model Methodologies & Documentation</h1>
        </div>
        <p className="text-white/60 leading-relaxed text-sm md:text-base">
          This document outlines the theoretical foundations, data sources, and calculation methodologies for the various macro-sensing models and scorecards used in the Cockpit. Understanding these underlying mechanics is crucial for interpreting the signals and applying them to tactical asset allocation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Flight2Safety Scorecard */}
        <section className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
            <BarChart2 className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-semibold text-white">Flight2Safety Scorecard</h2>
          </div>
          <div className="space-y-4 text-sm text-white/70">
            <p>
              <strong className="text-white">Bond Equity Allocation Timing Scorecard (Flight2Safety)</strong> is a composite macro model designed to dynamically tilt portfolios between Equities and Fixed Income.
            </p>
            <h3 className="text-white font-medium mt-4 mb-2">Methodology:</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Aggregates 10+ leading economic indicators (LEIs), including ISM Manufacturing New Orders, Building Permits, and Initial Jobless Claims.</li>
              <li>Calculates a Z-score for each indicator based on a rolling 3-year window to normalize volatility.</li>
              <li>Applies a momentum overlay (3-month rate of change) to detect inflection points early.</li>
              <li><strong>Signal Generation:</strong> A composite score above +1.0 triggers a "Risk On" (Overweight Equities) signal, while a score below -1.0 triggers a "Risk Off" (Overweight Bonds) signal.</li>
            </ul>
          </div>
        </section>

        {/* Regime Model */}
        <section className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
            <PieChart className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-semibold text-white">Macro Regime Model</h2>
          </div>
          <div className="space-y-4 text-sm text-white/70">
            <p>
              The Regime Model utilizes a <strong className="text-white">Hidden Markov Model (HMM)</strong> to probabilistically classify the current economic environment into one of four distinct states.
            </p>
            <h3 className="text-white font-medium mt-4 mb-2">The Four Regimes:</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-white">Goldilocks (Growth ↑, Inflation ↓):</strong> Favorable for risk assets, particularly growth equities and high yield credit.</li>
              <li><strong className="text-white">Reflation (Growth ↑, Inflation ↑):</strong> Favorable for commodities, value equities, and TIPS. Negative for long-duration bonds.</li>
              <li><strong className="text-white">Stagflation (Growth ↓, Inflation ↑):</strong> Highly defensive. Cash and commodities outperform. Equities and bonds both suffer.</li>
              <li><strong className="text-white">Contraction (Growth ↓, Inflation ↓):</strong> Favorable for long-duration sovereign bonds and defensive equity sectors (Utilities, Staples).</li>
            </ul>
            <p className="mt-2">
              <strong>Inputs:</strong> Real GDP growth proxies (CFNAI), CPI/PCE inflation data, and broad financial conditions indices.
            </p>
          </div>
        </section>

        {/* Recession Probability */}
        <section className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
            <ShieldAlert className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-semibold text-white">Recession Probability</h2>
          </div>
          <div className="space-y-4 text-sm text-white/70">
            <p>
              This model synthesizes immediate and forward-looking indicators to assess the likelihood of an NBER-defined economic recession.
            </p>
            <h3 className="text-white font-medium mt-4 mb-2">Key Components:</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-white">The Sahm Rule:</strong> Signals the start of a recession when the three-month moving average of the national unemployment rate rises by 0.50 percentage points or more relative to its low during the previous 12 months. Highly accurate real-time indicator.</li>
              <li><strong className="text-white">Yield Curve Probit Model:</strong> Calculates the 12-month forward probability of recession based on the spread between the 10-Year Treasury Constant Maturity and the 3-Month Treasury Bill. An inverted curve (spread &lt; 0) significantly increases recession probability.</li>
            </ul>
          </div>
        </section>

        {/* Yield Curve Model */}
        <section className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
            <ArrowRightLeft className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-semibold text-white">Yield Curve Dynamics</h2>
          </div>
          <div className="space-y-4 text-sm text-white/70">
            <p>
              Analyzes the term structure of US Treasuries to identify shifts in monetary policy expectations and growth outlooks.
            </p>
            <h3 className="text-white font-medium mt-4 mb-2">Curve Regimes:</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-white">Bull Steepening:</strong> Short-term rates fall faster than long-term rates. Typically occurs when the Fed cuts rates rapidly during an economic slowdown. Bullish for bonds.</li>
              <li><strong className="text-white">Bear Steepening:</strong> Long-term rates rise faster than short-term rates. Driven by rising inflation expectations or increased term premium. Bearish for bonds.</li>
              <li><strong className="text-white">Bull Flattening:</strong> Long-term rates fall faster than short-term rates. Often seen late in an economic cycle as growth expectations cool but the Fed holds short rates high.</li>
              <li><strong className="text-white">Bear Flattening:</strong> Short-term rates rise faster than long-term rates. Typical during a Fed hiking cycle as they combat inflation. Leads to inversions.</li>
            </ul>
          </div>
        </section>

        {/* Market Sentiment */}
        <section className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
            <MessageSquare className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">Market Sentiment Divergence</h2>
          </div>
          <div className="space-y-4 text-sm text-white/70">
            <p>
              Sentiment analysis is used as a contrarian indicator at extremes, tracking the divergence between institutional and retail participants.
            </p>
            <h3 className="text-white font-medium mt-4 mb-2">Data Sources:</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-white">Institutional (AlphaSense Macro):</strong> Aggregates sentiment scores using Natural Language Processing (NLP) on earnings call transcripts, broker research, and SEC filings. Represents "Smart Money" positioning.</li>
              <li><strong className="text-white">Retail (Twitter/X):</strong> Aggregates sentiment via social media cashtag tracking and retail options flow. Represents "Dumb Money" positioning.</li>
              <li><strong>Signal:</strong> Extreme divergence (e.g., Retail highly bullish while Institutional is highly bearish) often precedes sharp market reversals in the direction of institutional positioning.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
