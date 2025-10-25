import { GoogleGenAI, Type } from "@google/genai";
import { TradingAnalysis } from '../types';

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    marketSummary: {
      type: Type.OBJECT,
      properties: {
        trendDirection: { type: Type.STRING, description: "Uptrend, downtrend, or sideways." },
        priceBehavior: { type: Type.STRING, description: "Breakout, consolidation, pullback, or reversal." },
        keySupportResistance: { type: Type.STRING, description: "Where price often reacts." },
        indicatorAlignments: { type: Type.STRING, description: "Whether price is above/below EMA, VWAP, or if RSI shows strength/weakness." },
      },
    },
    openInterestAnalysis: {
      type: Type.OBJECT,
      properties: {
        ceVsPeStrength: { type: Type.STRING, description: "Compares total call and put open interest." },
        buildUpOrUnwinding: { type: Type.STRING, description: "Indicates if new positions are being created or closed." },
        majorStrikeLevels: { type: Type.STRING, description: "Lists strikes with the highest OI." },
        marketBias: { type: Type.STRING, description: "Overall directional hint (bullish/bearish/neutral) based on OI pattern." },
      },
    },
    optionChainInsight: {
      type: Type.OBJECT,
      properties: {
        heavyCePeActivity: { type: Type.STRING, description: "Top 3-5 strikes showing large OI or % change." },
        impliedVolatilityTrend: { type: Type.STRING, description: "Tells how market expects volatility." },
        pcr: { type: Type.STRING, description: "Put/Call Ratio, a gauge of sentiment." },
      },
    },
    technicalIndicatorAnalysis: {
      type: Type.OBJECT,
      properties: {
        emaVwapTrend: { type: Type.STRING, description: "EMA9 vs EMA15, price vs VWAP." },
        adx: { type: Type.STRING, description: "Measures trend strength." },
        rsiStochastic: { type: Type.STRING, description: "Indicates momentum and overbought/oversold zones using RSI, Stochastic, Williams %R." },
        divergences: { type: Type.STRING, description: "RSI or MACD divergence may warn of reversal." },
      },
    },
    finalTradingDecision: {
      type: Type.OBJECT,
      properties: {
        marketBias: { type: Type.STRING, enum: ['Bullish', 'Bearish', 'Neutral'] },
        entryZone: { type: Type.STRING, description: "Level where trade should trigger." },
        stopLoss: { type: Type.STRING, description: "Level to control risk." },
        target1: { type: Type.STRING, description: "First logical profit zone." },
        target2: { type: Type.STRING, description: "Second logical profit zone." },
        confidence: { type: Type.STRING, description: "Based on how many signals align (Low / Medium / High)." },
        riskRewardRatio: { type: Type.STRING, description: "Optional, helps measure trade viability." },
      },
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: "Logic behind the trading decision." },
        alignment: { type: Type.STRING, description: "If the bias aligns or counters OI or volatility data." },
        potential: { type: Type.STRING, description: "What the potential follow-through could be." },
      },
    },
  },
};


export const analyzeChart = async (images: { base64: string; mimeType: string }[], niftyPrice: string): Promise<TradingAnalysis> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY is not configured. Please set it as an environment variable in your deployment settings.");
  }
  const ai = new GoogleGenAI({ apiKey });

  try {
    const imageParts = images.map(image => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64,
      },
    }));

    const prompt = `
      As an expert trading analyst, your task is to generate a precise and actionable trade setup based on strict rules.
      
      ### 📜 Instructions
      - Read and extract key information separately from each uploaded screenshot.
      - Combine all findings with the **manually entered NIFTY price of ${niftyPrice}**.
      - Internally calculate and use the following indicators:
        - **VWAP**, **EMA (9 and 15)**, **RSI**, **ADX**, **MACD**, **Williams %R**, **Stochastic Oscillator**.
      - Integrate these internal indicator readings with Option Chain and OI insights to generate a single, accurate trade setup.
      
      ### 🚨 CRITICAL TRADING RULES
      1.  **High-Probability Filter**: You MUST only generate a trade setup if its probability of success is **above 85%**. If no such setup exists, set the 'marketBias' to 'Neutral', set confidence to 'Low', and explain in the 'reasoning.summary' that no high-probability trade was identified.
      2.  **Fixed Stop Loss**: The 'stopLoss' field in the final decision MUST be exactly **20 points** away from the 'entryZone'.
      
      ### 🧠 Output Format
      Your response MUST be a JSON object that adheres to the provided schema. Do not add any extra text, commentary, or markdown formatting outside of the JSON structure.
      
      ------------------------------
      - **📊 Market Summary (from Chart):** Describe market trend, price behavior, key supports/resistances, and indicator alignments (EMA, VWAP, RSI, etc.).
      - **🧩 Open Interest Analysis:** Summarize OI activity: CE vs PE OI strength, build-up or unwinding, major strike levels, and market bias from OI trends.
      - **💼 Option Chain Insight:** Summarize option chain readings: Strikes with heavy CE/PE activity, implied volatility trend, and PCR and sentiment.
      - **📈 Technical Indicator Analysis:** Summarize results from internal indicators (VWAP, EMA9/15, RSI, ADX, MACD, Williams %R, Stochastic): Trend and momentum strength, entry/exit confirmation or divergence signals.
      - **🎯 Final Trading Decision:** Based on all data (Chart + OI + Option Chain + NIFTY price): Market Bias (Bullish / Bearish / Neutral), Suggested Entry Zone, Stop Loss (strictly 20 points from entry), Target 1 / Target 2, Confidence Level (must be 'High' for a trade, corresponding to >85% probability), and optional Risk/Reward Ratio.
      - **⚙️ Reasoning:** Explain briefly why this trade setup makes sense — referencing key OI levels, indicator signals, and chart structure.
      ------------------------------
      
      ### ⚙️ Guidelines
      - Use only the screenshots and the provided NIFTY price — no external data.
      - Analyze all uploaded images individually, then synthesize insights.
      - Keep output concise, structured, and directly actionable for live trades. Adhere strictly to the CRITICAL TRADING RULES.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { text: prompt },
          ...imageParts
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    let jsonText = response.text.trim();
    // The model can sometimes wrap the JSON in markdown even when instructed not to.
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7, -3);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3, -3);
    }
    const parsedData = JSON.parse(jsonText);

    // Basic validation
    if (!parsedData.marketSummary || !parsedData.finalTradingDecision) {
        throw new Error("Invalid analysis structure received from API.");
    }

    return parsedData as TradingAnalysis;

  } catch (error) {
    console.error("Error analyzing chart with Gemini:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to get analysis from Gemini: ${error.message}`);
    }
    throw new Error("An unknown error occurred during Gemini API call.");
  }
};