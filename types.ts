

export interface MarketSummary {
  trendDirection: string;
  priceBehavior: string;
  keySupportResistance: string;
  indicatorAlignments: string;
}

export interface OpenInterestAnalysis {
  ceVsPeStrength: string;
  buildUpOrUnwinding: string;
  majorStrikeLevels: string;
  marketBias: string;
}

export interface OptionChainInsight {
  heavyCePeActivity: string;
  impliedVolatilityTrend: string;
  pcr: string;
}

export interface TechnicalIndicatorAnalysis {
  emaVwapTrend: string;
  adx: string;
  rsiStochastic: string;
  divergences: string;
}

export interface FinalTradingDecision {
  marketBias: 'Bullish' | 'Bearish' | 'Neutral';
  entryZone: string;
  stopLoss: string;
  target1: string;
  target2: string;
  confidence: string;
  riskRewardRatio?: string;
}

export interface Reasoning {
  summary: string;
  alignment: string;
  potential: string;
}

export interface TradingAnalysis {
  marketSummary: MarketSummary;
  openInterestAnalysis: OpenInterestAnalysis;
  optionChainInsight: OptionChainInsight;
  technicalIndicatorAnalysis: TechnicalIndicatorAnalysis;
  finalTradingDecision: FinalTradingDecision;
  reasoning: Reasoning;
}

// Add a new type for history entries
export interface TradingAnalysisWithTimestamp extends TradingAnalysis {
  id: string;
  timestamp: string;
}

// Add a new type for app configuration
export interface AppConfig {
  title: string;
  subtitle: string;
}

// FIX: Moved the AIStudio interface into the `declare global` block to resolve conflicts with other global declarations of `window.aistudio`.
// Exporting the interface from the module was causing type mismatches.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    // FIX: Made 'aistudio' optional to resolve modifier conflicts with another global declaration.
    aistudio?: AIStudio;
  }
}
