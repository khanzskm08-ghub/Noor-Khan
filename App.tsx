

import React, { useState, useCallback, useEffect } from 'react';
// Import new type for history entries
// FIX: Removed unused AIStudio import. The global type for window.aistudio is now defined in types.ts.
import { TradingAnalysis, FinalTradingDecision, TradingAnalysisWithTimestamp, AppConfig } from './types';
import { analyzeChart } from './services/geminiService';
import { ChartBarIcon, PuzzleIcon, LinkIcon, TrendingUpIcon, TargetIcon, LightbulbIcon, ShareIcon, CheckIcon } from './components/Icons';

// FIX: Removed duplicate global declaration for window.aistudio. It is now centralized in types.ts to resolve declaration conflicts.

const fileToDataUrl = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1];
      if (!mimeType || !base64) {
        reject(new Error("Could not parse file data URL."));
      } else {
        resolve({ base64, mimeType });
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const DEFAULT_CONFIG: AppConfig = {
    title: 'Skyalgo.Ai',
    subtitle: 'Upload chart data stream for AI-powered trading analysis.',
};

const App: React.FC = () => {
  const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null, null, null]);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null, null, null]);
  const [niftyPrice, setNiftyPrice] = useState<string>('');
  const [analysis, setAnalysis] = useState<TradingAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyReady, setIsApiKeyReady] = useState<boolean>(false);
  const [analysisHistory, setAnalysisHistory] = useState<TradingAnalysisWithTimestamp[]>([]);
  const [viewOnlyAnalysis, setViewOnlyAnalysis] = useState<TradingAnalysis | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Admin mode state
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [tempConfig, setTempConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const viewData = queryParams.get('view');

    if (viewData) {
        try {
            const jsonString = atob(decodeURIComponent(viewData));
            const parsedAnalysis = JSON.parse(jsonString);
            if (parsedAnalysis.marketSummary && parsedAnalysis.finalTradingDecision) {
                setViewOnlyAnalysis(parsedAnalysis);
            } else {
                setError(">>> ERROR: Invalid share link data.");
            }
        } catch (e) {
            console.error("Failed to parse shared analysis data", e);
            setError(">>> ERROR: Could not load the shared analysis. The link may be corrupted.");
        }
        return; 
    }

    if (queryParams.get('admin') === 'true') {
      setIsAdminMode(true);
    }
      
    try {
      const storedConfig = localStorage.getItem('appConfig');
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig);
        setAppConfig(parsedConfig);
        setTempConfig(parsedConfig);
      }
    } catch (e) {
      console.error("Failed to load app config from localStorage", e);
    }
      
    const checkApiKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setIsApiKeyReady(true);
      }
    };
    checkApiKey();

    try {
      const storedHistory = localStorage.getItem('analysisHistory');
      if (storedHistory) {
        setAnalysisHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load analysis history from localStorage", e);
      setAnalysisHistory([]);
    }
  }, []);

  const handleSelectKey = async () => {
    // FIX: Added a check for window.aistudio to handle cases where it might be undefined, preventing a potential runtime error.
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setIsApiKeyReady(true);
    }
  };

  const handleShareAnalysis = (item: TradingAnalysisWithTimestamp) => {
    try {
        const jsonString = JSON.stringify(item);
        const encodedData = encodeURIComponent(btoa(jsonString));
        const shareUrl = `${window.location.origin}${window.location.pathname}?view=${encodedData}`;

        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopiedId(item.id);
            setTimeout(() => setCopiedId(null), 2000);
        }).catch(err => {
            console.error('Failed to copy link', err);
            alert('Failed to copy link. Please copy it manually from the console.');
            console.log(shareUrl);
        });
    } catch (e) {
        console.error("Failed to create share link", e);
        alert("Could not create share link.");
    }
  };

  const handleImageChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const newFiles = [...imageFiles];
      newFiles[index] = file;
      setImageFiles(newFiles);

      const newPreviews = [...imagePreviews];
      if (newPreviews[index]) {
        URL.revokeObjectURL(newPreviews[index] as string);
      }
      newPreviews[index] = URL.createObjectURL(file);
      setImagePreviews(newPreviews);
      
      setAnalysis(null);
      setError(null);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newFiles = [...imageFiles];
    newFiles[index] = null;
    setImageFiles(newFiles);

    const newPreviews = [...imagePreviews];
    const oldPreview = newPreviews[index];
    if (oldPreview) {
      URL.revokeObjectURL(oldPreview);
    }
    newPreviews[index] = null;
    setImagePreviews(newPreviews);
  };

  const handleAnalyzeClick = useCallback(async () => {
    const uploadedFiles = imageFiles.filter(file => file !== null) as File[];

    if (uploadedFiles.length === 0) {
      setError(">>> ERROR: Upload at least one data stream image.");
      return;
    }
    
    if (!niftyPrice.trim()) {
      setError(">>> ERROR: Enter current NIFTY price signal.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const imageDatas = await Promise.all(uploadedFiles.map(file => fileToDataUrl(file)));
      const result = await analyzeChart(imageDatas, niftyPrice);
      setAnalysis(result);

      const newHistoryEntry: TradingAnalysisWithTimestamp = {
        ...result,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
      };
      
      setAnalysisHistory(prevHistory => {
          const updatedHistory = [newHistoryEntry, ...prevHistory].slice(0, 50);
          localStorage.setItem('analysisHistory', JSON.stringify(updatedHistory));
          return updatedHistory;
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      if (errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('Requested entity was not found.')) {
        setError(">>> API KEY ERROR: Permission denied or invalid. Please select a valid key and try again.");
        setIsApiKeyReady(false);
      } else {
        setError(`>>> ANALYSIS FAILED: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [imageFiles, niftyPrice]);

  const handleReset = () => {
    imagePreviews.forEach(p => p && URL.revokeObjectURL(p));
    setImageFiles([null, null, null, null, null]);
    setImagePreviews([null, null, null, null, null]);
    setNiftyPrice('');
    setAnalysis(null);
    setError(null);
    setIsLoading(false);
  };

  const handleViewHistoryItem = (item: TradingAnalysisWithTimestamp) => {
    setAnalysis(item);
    setError(null);
    setIsLoading(false);
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to purge the analysis history archive? This action cannot be undone.")) {
      localStorage.removeItem('analysisHistory');
      setAnalysisHistory([]);
      if(analysis && (analysis as TradingAnalysisWithTimestamp).id) {
          setAnalysis(null);
      }
    }
  };

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTempConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveChanges = () => {
    setAppConfig(tempConfig);
    localStorage.setItem('appConfig', JSON.stringify(tempConfig));
    alert('Changes saved!');
  };
  
  const biasColorClasses = {
    Bullish: "text-cyan-400 border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.5)]",
    Bearish: "text-fuchsia-400 border-fuchsia-400/50 shadow-[0_0_20px_rgba(232,121,249,0.5)]",
    Neutral: "text-gray-400 border-gray-500/50",
  };

  const biasBadgeColorClasses = {
    Bullish: "bg-cyan-500/20 text-cyan-300",
    Bearish: "bg-fuchsia-500/20 text-fuchsia-300",
    Neutral: "bg-gray-500/20 text-gray-300",
  };
  
  const AdminPanel = () => (
    <div className="fixed bottom-4 right-4 bg-black/80 p-6 rounded-md border border-yellow-400/50 shadow-[0_0_20px_rgba(250,204,21,0.4)] backdrop-blur-md z-50 w-full max-w-sm">
        <h3 className="text-xl font-bold text-yellow-400 mb-4">Admin Panel</h3>
        <div className="space-y-4">
            <div>
                <label htmlFor="title" className="block text-sm font-semibold text-gray-400 mb-1">App Title</label>
                <input
                    type="text"
                    id="title"
                    name="title"
                    value={tempConfig.title}
                    onChange={handleConfigChange}
                    className="w-full bg-black/50 border border-yellow-400/50 rounded-md p-2 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition-all"
                />
            </div>
            <div>
                <label htmlFor="subtitle" className="block text-sm font-semibold text-gray-400 mb-1">App Subtitle</label>
                <input
                    type="text"
                    id="subtitle"
                    name="subtitle"
                    value={tempConfig.subtitle}
                    onChange={handleConfigChange}
                    className="w-full bg-black/50 border border-yellow-400/50 rounded-md p-2 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none transition-all"
                />
            </div>
        </div>
        <button
            onClick={handleSaveChanges}
            className="mt-6 w-full text-black bg-yellow-400 hover:bg-yellow-500 border border-yellow-500 focus:ring-4 focus:outline-none focus:ring-yellow-500/50 font-bold rounded-md text-md px-5 py-2.5 text-center transition-all duration-300 ease-in-out"
        >
            Save Changes
        </button>
    </div>
  );

  const DecisionCard: React.FC<{ decision: FinalTradingDecision }> = ({ decision }) => (
    <div className={`bg-black/60 p-6 rounded-md border ${biasColorClasses[decision.marketBias] || biasColorClasses['Neutral']} backdrop-blur-sm transition-all duration-300`}>
      <div className="flex items-center mb-4">
        <TargetIcon className={`w-8 h-8 mr-4 ${(biasColorClasses[decision.marketBias] || biasColorClasses['Neutral']).split(' ')[0]}`} />
        <div>
          <h3 className="text-xl font-bold text-gray-100">Final Trading Decision</h3>
          <p className={`text-lg font-semibold ${(biasColorClasses[decision.marketBias] || biasColorClasses['Neutral']).split(' ')[0]}`}>{decision.marketBias}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="bg-black/30 p-3 rounded-sm">
          <p className="font-semibold text-gray-400">Entry Zone:</p>
          <p className="text-gray-200">{decision.entryZone}</p>
        </div>
        <div className="bg-black/30 p-3 rounded-sm">
          <p className="font-semibold text-gray-400">Stop Loss:</p>
          <p className="text-gray-200">{decision.stopLoss}</p>
        </div>
        <div className="bg-black/30 p-3 rounded-sm">
          <p className="font-semibold text-gray-400">Target 1:</p>
          <p className="text-gray-200">{decision.target1}</p>
        </div>
        <div className="bg-black/30 p-3 rounded-sm">
          <p className="font-semibold text-gray-400">Target 2:</p>
          <p className="text-gray-200">{decision.target2}</p>
        </div>
      </div>
       <div className="mt-4 bg-black/30 p-3 rounded-sm">
          <p className="font-semibold text-gray-400">Confidence:</p>
          <p className="text-gray-200">{decision.confidence}</p>
        </div>
    </div>
  );

  const AnalysisItemCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-black/60 p-6 rounded-md border border-green-400/30 shadow-[0_0_15px_rgba(52,211,153,0.1)] backdrop-blur-sm">
      <div className="flex items-center mb-3">
        {icon}
        <h3 className="text-lg font-semibold text-green-400 ml-3">{title}</h3>
      </div>
      <div className="space-y-3 text-gray-300 text-sm">{children}</div>
    </div>
  );
  
  const showResetButton = imagePreviews.some(p => p !== null) || analysis || error || !!niftyPrice.trim();
  
  if (viewOnlyAnalysis) {
    return (
        <div className="min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="max-w-3xl mx-auto">
                <header className="text-center mb-12">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-wider" style={{ textShadow: '0 0 10px rgba(52, 211, 153, 0.5)' }}>
                        Shared Analysis
                    </h1>
                     <p className="mt-2 text-gray-400 text-lg">
                        from {appConfig.title}
                    </p>
                </header>
                {error && <div className="mb-6 bg-red-900/50 text-red-300 p-4 rounded-md border border-red-700 font-mono">{error}</div>}
                <div className="space-y-6">
                  <DecisionCard decision={viewOnlyAnalysis.finalTradingDecision} />
                  <AnalysisItemCard title="Market Summary" icon={<ChartBarIcon className="w-6 h-6 text-green-400" />}>
                    <p>{viewOnlyAnalysis.marketSummary?.trendDirection} {viewOnlyAnalysis.marketSummary?.priceBehavior} {viewOnlyAnalysis.marketSummary?.keySupportResistance} {viewOnlyAnalysis.marketSummary?.indicatorAlignments}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Reasoning" icon={<LightbulbIcon className="w-6 h-6 text-yellow-400" />}>
                    <p>{viewOnlyAnalysis.reasoning?.summary} {viewOnlyAnalysis.reasoning?.alignment} {viewOnlyAnalysis.reasoning?.potential}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Open Interest Analysis" icon={<PuzzleIcon className="w-6 h-6 text-cyan-400" />}>
                    <p><strong className="text-gray-400">Strength:</strong> {viewOnlyAnalysis.openInterestAnalysis?.ceVsPeStrength}</p>
                    <p><strong className="text-gray-400">Activity:</strong> {viewOnlyAnalysis.openInterestAnalysis?.buildUpOrUnwinding}</p>
                    <p><strong className="text-gray-400">Key Levels:</strong> {viewOnlyAnalysis.openInterestAnalysis?.majorStrikeLevels}</p>
                    <p><strong className="text-gray-400">Bias:</strong> {viewOnlyAnalysis.openInterestAnalysis?.marketBias}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Option Chain Insight" icon={<LinkIcon className="w-6 h-6 text-fuchsia-400" />}>
                    <p><strong className="text-gray-400">Heavy Activity:</strong> {viewOnlyAnalysis.optionChainInsight?.heavyCePeActivity}</p>
                    <p><strong className="text-gray-400">IV Trend:</strong> {viewOnlyAnalysis.optionChainInsight?.impliedVolatilityTrend}</p>
                    <p><strong className="text-gray-400">PCR:</strong> {viewOnlyAnalysis.optionChainInsight?.pcr}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Technical Indicator Analysis" icon={<TrendingUpIcon className="w-6 h-6 text-blue-400" />}>
                    <p><strong className="text-gray-400">Trend:</strong> {viewOnlyAnalysis.technicalIndicatorAnalysis?.emaVwapTrend}</p>
                    <p><strong className="text-gray-400">ADX:</strong> {viewOnlyAnalysis.technicalIndicatorAnalysis?.adx}</p>
                    <p><strong className="text-gray-400">Momentum:</strong> {viewOnlyAnalysis.technicalIndicatorAnalysis?.rsiStochastic}</p>
                    <p><strong className="text-gray-400">Divergence:</strong> {viewOnlyAnalysis.technicalIndicatorAnalysis?.divergences}</p>
                  </AnalysisItemCard>
                </div>
                <div className="text-center mt-12">
                    <a
                        href={window.location.origin + window.location.pathname}
                        className="text-white bg-green-600/80 hover:bg-green-600/100 border border-green-500 focus:ring-4 focus:outline-none focus:ring-green-500/50 font-medium rounded-md text-lg px-8 py-3 text-center transition-all duration-300 ease-in-out shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                    >
                        Create Your Own Analysis
                    </a>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {isAdminMode && <AdminPanel />}
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-5xl sm:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500 tracking-wider" style={{ textShadow: '0 0 10px rgba(52, 211, 153, 0.5)' }}>
            {appConfig.title}
          </h1>
          <p className="mt-2 text-gray-400 text-lg">
            {isApiKeyReady 
              ? appConfig.subtitle 
              : "Connect your API key to begin..."}
          </p>
        </header>

        {!isApiKeyReady ? (
            <div className="flex items-center justify-center mt-12">
              <div className="w-full max-w-lg">
                <div className="bg-black/60 p-8 rounded-md border border-green-500/50 shadow-[0_0_20px_rgba(52,211,153,0.4)] backdrop-blur-sm">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-green-400 mb-4">Connect to Analysis Engine</h2>
                    <p className="text-gray-400 mb-6">
                      To activate the AI, please connect your Google AI API key. This enables Skyalgo.Ai to analyze market data in real-time. Ensure your project has billing enabled.
                    </p>
                    <button
                      onClick={handleSelectKey}
                      className="w-full text-white bg-green-600/80 hover:bg-green-600/100 border border-green-500 focus:ring-4 focus:outline-none focus:ring-green-500/50 font-medium rounded-md text-lg px-5 py-3 text-center transition-all duration-300 ease-in-out shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                    >
                      Connect API Key
                    </button>
                    <p className="mt-4 text-xs text-gray-500">
                      Ref: {' '}
                      <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                        billing documentation
                      </a>.
                    </p>
                  </div>
                   {error && <div className="mt-4 bg-red-900/50 text-red-300 p-4 rounded-md border border-red-700 font-mono">{error}</div>}
                </div>
              </div>
            </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="flex flex-col space-y-6">
              <div className="bg-black/60 p-6 rounded-md border border-green-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)] backdrop-blur-sm">
                <h2 className="text-2xl font-bold mb-4 text-green-400">1. INPUT DATA STREAM</h2>
                
                <div className="mb-6">
                  <label htmlFor="nifty-price" className="block text-sm font-semibold text-gray-400 mb-2">
                    Current NIFTY Price Signal
                  </label>
                  <input
                    id="nifty-price"
                    type="number"
                    value={niftyPrice}
                    onChange={(e) => setNiftyPrice(e.target.value)}
                    placeholder="Enter current NIFTY spot price"
                    className="w-full bg-black/50 border border-green-400/50 rounded-md p-3 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                    aria-required="true"
                  />
                </div>

                <div className="space-y-4">
                  {[0, 1, 2, 3, 4].map((index) => (
                      <div key={index}>
                        <h3 className="text-sm font-semibold text-gray-400 mb-2">Interface {index + 1} (Upload Screenshot)</h3>
                        <div className="w-full h-32">
                          {imagePreviews[index] ? (
                            <div className="relative w-full h-full group">
                              <img src={imagePreviews[index]} alt={`Chart preview ${index + 1}`} className="rounded-md w-full h-full object-cover border-2 border-green-500/50" />
                              <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-md">
                                <button
                                  onClick={() => handleRemoveImage(index)}
                                  className="text-red-400 bg-red-500/20 hover:bg-red-500/40 rounded-full p-2 focus:outline-none focus:ring-2 focus:ring-red-500 border border-red-500/50"
                                  aria-label={`Remove image ${index + 1}`}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label htmlFor={`dropzone-file-${index}`} className="flex flex-col items-center justify-center w-full h-full border-2 border-green-600/30 border-dashed rounded-md cursor-pointer bg-black/20 hover:bg-green-900/20 hover:border-green-500/80 transition-colors">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <svg className="w-8 h-8 mb-2 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                                    </svg>
                                    <p className="text-sm text-gray-400"><span className="font-semibold text-green-400">Click to upload</span> or drag & drop</p>
                                </div>
                                <input id={`dropzone-file-${index}`} type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageChange(index)} />
                            </label>
                          )}
                        </div>
                      </div>
                  ))}
                </div>
              </div>

              {imagePreviews.some(p => p !== null) && (
                <div className="bg-black/60 p-6 rounded-md border border-green-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)] backdrop-blur-sm">
                  <h2 className="text-2xl font-bold mb-4 text-green-400">2. EXECUTE ANALYSIS</h2>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={handleAnalyzeClick}
                      disabled={isLoading}
                      className="w-full text-white bg-green-600/80 hover:bg-green-600/100 border border-green-500 focus:ring-4 focus:outline-none focus:ring-green-500/50 font-medium rounded-md text-lg px-5 py-3 text-center transition-all duration-300 ease-in-out shadow-[0_0_15px_rgba(52,211,153,0.5)] disabled:bg-gray-700 disabled:border-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Analyzing...
                        </>
                      ) : 'Generate Analysis'}
                    </button>
                    {showResetButton && (
                      <button
                        onClick={handleReset}
                        disabled={isLoading}
                        className="text-gray-300 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600 focus:ring-4 focus:outline-none focus:ring-gray-500/50 font-medium rounded-md text-lg px-5 py-3 text-center transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Reset form"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}

              {analysisHistory.length > 0 && (
                <div className="bg-black/60 p-6 rounded-md border border-green-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)] backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-green-400">Analysis Archive</h2>
                    <button
                      onClick={handleClearHistory}
                      className="text-sm text-red-400 hover:text-red-300 hover:bg-red-500/20 px-3 py-1 rounded-md transition-colors"
                      aria-label="Clear analysis history"
                    >
                      Purge History
                    </button>
                  </div>
                  <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {analysisHistory.map((item) => (
                      <li key={item.id}>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleShareAnalysis(item)}
                            className="p-2 rounded-md bg-gray-700/50 hover:bg-green-900/60 text-gray-400 hover:text-green-300 transition-colors"
                            aria-label="Share analysis"
                          >
                            {copiedId === item.id ? (
                                <CheckIcon className="h-4 w-4 text-green-400" />
                            ) : (
                                <ShareIcon className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleViewHistoryItem(item)}
                            className="w-full text-left p-3 rounded-md bg-black/40 hover:bg-green-900/40 border border-transparent hover:border-green-500/50 transition-all flex justify-between items-center group flex-grow"
                          >
                            <span className="text-sm text-gray-300 group-hover:text-white">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${biasBadgeColorClasses[item.finalTradingDecision.marketBias]}`}>
                              {item.finalTradingDecision.marketBias}
                            </span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="flex flex-col space-y-6">
              {isLoading && (
                <div className="flex items-center justify-center h-full bg-black/60 p-6 rounded-md border border-green-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)] backdrop-blur-sm">
                  <div className="text-center">
                    <svg className="animate-spin mx-auto h-12 w-12 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-lg text-gray-200">AI is analyzing the data stream...</p>
                    <p className="text-sm text-gray-500">Engaging quantum processors...</p>
                  </div>
                </div>
              )}
              {error && <div className="bg-red-900/50 text-red-300 p-4 rounded-md border border-red-700 font-mono">{error}</div>}
              {!analysis && !isLoading && !error && (
                <div className="flex items-center justify-center h-full bg-black/60 p-6 rounded-md border border-green-600/30 border-dashed backdrop-blur-sm">
                  <p className="text-center text-gray-500 text-lg">Awaiting analysis output...</p>
                </div>
              )}
              {analysis && (
                <div className="space-y-6">
                  <DecisionCard decision={analysis.finalTradingDecision} />
                  <AnalysisItemCard title="Market Summary" icon={<ChartBarIcon className="w-6 h-6 text-green-400" />}>
                    <p>{analysis.marketSummary?.trendDirection} {analysis.marketSummary?.priceBehavior} {analysis.marketSummary?.keySupportResistance} {analysis.marketSummary?.indicatorAlignments}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Reasoning" icon={<LightbulbIcon className="w-6 h-6 text-yellow-400" />}>
                    <p>{analysis.reasoning?.summary} {analysis.reasoning?.alignment} {analysis.reasoning?.potential}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Open Interest Analysis" icon={<PuzzleIcon className="w-6 h-6 text-cyan-400" />}>
                    <p><strong className="text-gray-400">Strength:</strong> {analysis.openInterestAnalysis?.ceVsPeStrength}</p>
                    <p><strong className="text-gray-400">Activity:</strong> {analysis.openInterestAnalysis?.buildUpOrUnwinding}</p>
                    <p><strong className="text-gray-400">Key Levels:</strong> {analysis.openInterestAnalysis?.majorStrikeLevels}</p>
                    <p><strong className="text-gray-400">Bias:</strong> {analysis.openInterestAnalysis?.marketBias}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Option Chain Insight" icon={<LinkIcon className="w-6 h-6 text-fuchsia-400" />}>
                    <p><strong className="text-gray-400">Heavy Activity:</strong> {analysis.optionChainInsight?.heavyCePeActivity}</p>
                    <p><strong className="text-gray-400">IV Trend:</strong> {analysis.optionChainInsight?.impliedVolatilityTrend}</p>
                    <p><strong className="text-gray-400">PCR:</strong> {analysis.optionChainInsight?.pcr}</p>
                  </AnalysisItemCard>
                  <AnalysisItemCard title="Technical Indicator Analysis" icon={<TrendingUpIcon className="w-6 h-6 text-blue-400" />}>
                    <p><strong className="text-gray-400">Trend:</strong> {analysis.technicalIndicatorAnalysis?.emaVwapTrend}</p>
                    <p><strong className="text-gray-400">ADX:</strong> {analysis.technicalIndicatorAnalysis?.adx}</p>
                    <p><strong className="text-gray-400">Momentum:</strong> {analysis.technicalIndicatorAnalysis?.rsiStochastic}</p>
                    <p><strong className="text-gray-400">Divergence:</strong> {analysis.technicalIndicatorAnalysis?.divergences}</p>
                  </AnalysisItemCard>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
