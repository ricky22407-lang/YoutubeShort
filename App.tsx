import React, { useState } from 'react';
import { ModuleCard } from './components/ModuleCard';
import { TrendSignalExtractor } from './modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from './modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from './modules/CandidateWeightEngine';
import { PromptComposer } from './modules/PromptComposer';
import { runTrendExtractorTests } from './tests/TrendSignalExtractor.test';
import { runCandidateGeneratorTests } from './tests/CandidateThemeGenerator.test';
import { runWeightEngineTests } from './tests/CandidateWeightEngine.test';
import { runPromptComposerTests } from './tests/PromptComposer.test';
import { MOCK_SHORTS_DATA, MOCK_CHANNEL_STATE } from './constants';
import { ShortsData, TrendSignals, CandidateTheme, PromptOutput, TestResult } from './types';

const App: React.FC = () => {
  // State for pipeline data
  const [trendSignals, setTrendSignals] = useState<TrendSignals | null>(null);
  const [candidates, setCandidates] = useState<CandidateTheme[] | null>(null);
  const [scoredCandidates, setScoredCandidates] = useState<CandidateTheme[] | null>(null);
  const [promptOutput, setPromptOutput] = useState<PromptOutput | null>(null);

  // State for statuses
  const [s1Status, setS1Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s2Status, setS2Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s3Status, setS3Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [s4Status, setS4Status] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Test Results
  const [t1Result, setT1Result] = useState<TestResult | null>(null);
  const [t2Result, setT2Result] = useState<TestResult | null>(null);
  const [t3Result, setT3Result] = useState<TestResult | null>(null);
  const [t4Result, setT4Result] = useState<TestResult | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Module Instances
  const extractor = new TrendSignalExtractor();
  const generator = new CandidateThemeGenerator();
  const weighter = new CandidateWeightEngine();
  const composer = new PromptComposer();

  // Handlers
  const handleExecuteExtractor = async () => {
    setS1Status('loading');
    setErrorMsg(null);
    try {
      const result = await extractor.execute(MOCK_SHORTS_DATA);
      setTrendSignals(result);
      setS1Status('success');
    } catch (e: any) {
      setErrorMsg(e.message);
      setS1Status('error');
    }
  };

  const handleExecuteGenerator = async () => {
    if (!trendSignals) return;
    setS2Status('loading');
    setErrorMsg(null);
    try {
      const result = await generator.execute(trendSignals);
      setCandidates(result);
      setS2Status('success');
    } catch (e: any) {
      setErrorMsg(e.message);
      setS2Status('error');
    }
  };

  const handleExecuteWeighter = async () => {
    if (!candidates) return;
    setS3Status('loading');
    setErrorMsg(null);
    try {
      const result = await weighter.execute({ candidates, channelState: MOCK_CHANNEL_STATE });
      setScoredCandidates(result);
      setS3Status('success');
    } catch (e: any) {
      setErrorMsg(e.message);
      setS3Status('error');
    }
  };

  const handleExecuteComposer = async () => {
    if (!scoredCandidates) return;
    setS4Status('loading');
    setErrorMsg(null);
    try {
      const selected = scoredCandidates.find(c => c.selected);
      if (!selected) throw new Error("No candidate selected by Weight Engine");
      const result = await composer.execute(selected);
      setPromptOutput(result);
      setS4Status('success');
    } catch (e: any) {
      setErrorMsg(e.message);
      setS4Status('error');
    }
  };

  const runTest1 = async () => {
     const res = await runTrendExtractorTests();
     setT1Result(res);
     return res;
  }
  const runTest2 = async () => {
    const res = await runCandidateGeneratorTests();
    setT2Result(res);
    return res;
  }
  const runTest3 = async () => {
    const res = await runWeightEngineTests();
    setT3Result(res);
    return res;
  }
  const runTest4 = async () => {
    const res = await runPromptComposerTests();
    setT4Result(res);
    return res;
  }


  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="mb-10 border-b border-slate-700 pb-6">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
          YouTube Shorts Automation System
        </h1>
        <p className="text-slate-400 mt-2">
          Project Gemini & Grok • Automated Trend Analysis & Content Generation Pipeline
        </p>
      </header>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-8">
        
        {/* Phase 1 */}
        <div className="relative">
          <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-slate-700 -z-10 h-full"></div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-indigo-500 flex items-center justify-center font-bold text-indigo-400 shrink-0">
              01
            </div>
            <div className="flex-1">
              <ModuleCard
                title="Trend Signal Extractor"
                description="Analyzes raw input data to find statistical signals."
                status={s1Status}
                canExecute={true}
                onExecute={handleExecuteExtractor}
                onRunTest={runTest1}
                testResult={t1Result}
                data={trendSignals}
              />
            </div>
          </div>
        </div>

        {/* Phase 2 */}
        <div className="relative">
          <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-slate-700 -z-10 h-full"></div>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold shrink-0 transition-colors ${trendSignals ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-900 border-slate-700 text-slate-600'}`}>
              02
            </div>
            <div className="flex-1">
              <ModuleCard
                title="Candidate Theme Generator"
                description="Brainstorms 3 creative concepts based on trend signals."
                status={s2Status}
                canExecute={!!trendSignals}
                onExecute={handleExecuteGenerator}
                onRunTest={runTest2}
                testResult={t2Result}
                data={candidates}
              />
            </div>
          </div>
        </div>

        {/* Phase 3 */}
        <div className="relative">
          <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-slate-700 -z-10 h-full"></div>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold shrink-0 transition-colors ${candidates ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-900 border-slate-700 text-slate-600'}`}>
              03
            </div>
            <div className="flex-1">
              <ModuleCard
                title="Candidate Weight Engine"
                description="Scores candidates on virality & feasibility. Picks the winner."
                status={s3Status}
                canExecute={!!candidates}
                onExecute={handleExecuteWeighter}
                onRunTest={runTest3}
                testResult={t3Result}
                data={scoredCandidates}
              />
            </div>
          </div>
        </div>

        {/* Phase 4 */}
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold shrink-0 transition-colors ${scoredCandidates ? 'bg-slate-800 border-indigo-500 text-indigo-400' : 'bg-slate-900 border-slate-700 text-slate-600'}`}>
              04
            </div>
            <div className="flex-1">
              <ModuleCard
                title="Prompt Composer"
                description="Generates final prompt, title template, and description for the winner."
                status={s4Status}
                canExecute={!!scoredCandidates}
                onExecute={handleExecuteComposer}
                onRunTest={runTest4}
                testResult={t4Result}
                data={promptOutput}
              />
            </div>
          </div>
        </div>

      </div>

      <footer className="mt-16 text-center text-slate-600 text-sm">
        System Status: <span className="text-green-500">Operational</span> | Roles: Gemini (Eng), Grok (PM)
      </footer>
    </div>
  );
};

export default App;