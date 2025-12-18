import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult, TestResult 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';
import { ModuleCard } from './components/ModuleCard';

// Test Runners
import { runTrendExtractorTests } from './tests/TrendSignalExtractor.test';
import { runCandidateGeneratorTests } from './tests/CandidateThemeGenerator.test';
import { runWeightEngineTests } from './tests/CandidateWeightEngine.test';
import { runPromptComposerTests } from './tests/PromptComposer.test';
import { runVideoGeneratorTests } from './tests/VideoGenerator.test';
import { runUploaderTests } from './tests/UploaderScheduler.test';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeChannelId, setByChannelId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  
  const [pipelineStates, setPipelineStates] = useState<Record<string, any>>({});
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  // Form State
  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech, Science");

  useEffect(() => {
    const saved = localStorage.getItem('sas_channels_v3');
    if (saved) {
      setChannels(JSON.parse(saved));
    } else {
      const demo: ChannelConfig = {
        id: 'demo-1',
        name: 'AI 探索實驗室',
        regionCode: 'US',
        searchKeywords: ['AI', 'Science'],
        channelState: MOCK_CHANNEL_STATE,
        schedule: { active: false, privacy_status: 'private' },
        auth: null,
        status: 'idle'
      };
      setChannels([demo]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sas_channels_v3', JSON.stringify(channels));
  }, [channels]);

  const addLog = (channelId: string, level: 'info' | 'success' | 'error', msg: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName: channels.find(c => c.id === channelId)?.name || 'System',
      level,
      message: msg
    };
    setLogs(prev => [entry, ...prev]);
  };

  const createChannel = () => {
    if (!newChannelName) return;
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName,
      regionCode: "US",
      searchKeywords: newKeywords.split(',').map(s => s.trim()),
      channelState: { ...MOCK_CHANNEL_STATE, niche: newKeywords },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels([...channels, newChannel]);
    setIsAdding(false);
    setNewChannelName("");
    addLog(newChannel.id, 'success', `頻道 ${newChannelName} 已成功建立。`);
  };

  const deleteChannel = (id: string) => {
    setChannels(channels.filter(c => c.id !== id));
    if (activeChannelId === id) setByChannelId(null);
  };

  const runPipeline = async (channel: ChannelConfig) => {
    // 確保介面切換
    setByChannelId(channel.id);
    setActiveTab('dashboard');
    
    addLog(channel.id, 'info', '初始化全自動流水線...');
    
    setPipelineStates(prev => ({ 
      ...prev, 
      [channel.id]: { currentStep: 1, status: 'running' } 
    }));

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelConfig: channel })
      });
      
      if (!res.ok) throw new Error("API Route 暫不可用");
      
      const result: PipelineResult = await res.json();
      if (result.success) {
        addLog(channel.id, 'success', '全流程執行成功！');
        setPipelineStates(prev => ({ 
          ...prev, 
          [channel.id]: { status: 'success', data: result, currentStep: 7 } 
        }));
      } else {
        throw new Error(result.error);
      }
    } catch (e: any) {
      addLog(channel.id, 'info', '進入模擬執行模式...');
      simulatePipeline(channel.id);
    }
  };

  const simulatePipeline = async (channelId: string) => {
    const steps = [1, 2, 3, 4, 5, 6];
    for (const step of steps) {
      setPipelineStates(prev => ({ 
        ...prev, 
        [channelId]: { currentStep: step, status: 'running' } 
      }));
      addLog(channelId, 'info', `正在處理模組：0${step}`);
      await new Promise(r => setTimeout(r, 1200));
    }
    
    addLog(channelId, 'success', '模擬流程完成！');
    setPipelineStates(prev => ({ 
      ...prev, 
      [channelId]: { 
        status: 'success', 
        currentStep: 7,
        data: {
          logs: ["Simulated: Signal Extraction (100%)", "Simulated: Winner Concept 'AI Cat'"],
          videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" 
        } 
      } 
    }));
  };

  const getModuleStatus = (channelId: string, step: number) => {
    const state = pipelineStates[channelId];
    if (!state) return 'idle';
    if (state.status === 'success' || state.currentStep > step) return 'success';
    if (state.currentStep === step && state.status === 'running') return 'loading';
    return 'idle';
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200 antialiased overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col fixed inset-y-0 z-50">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white shadow-xl shadow-indigo-500/20">S</div>
            <h1 className="font-bold text-xl tracking-tighter">Shorts AI</h1>
          </div>
          
          <nav className="space-y-1">
            <button 
              onClick={() => { setActiveTab('dashboard'); setByChannelId(null); }}
              className={`w-full text-left px-5 py-3 rounded-xl transition-all flex items-center gap-3 ${activeTab === 'dashboard' && !activeChannelId ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              📊 <span className="text-sm font-medium">總覽儀表板</span>
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`w-full text-left px-5 py-3 rounded-xl transition-all flex items-center gap-3 ${activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              📜 <span className="text-sm font-medium">系統日誌</span>
            </button>
          </nav>

          <div className="mt-12">
            <div className="flex items-center justify-between mb-4 px-2">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">頻道清單</p>
               <button onClick={() => setIsAdding(true)} className="text-indigo-400 hover:text-indigo-300 text-sm">+</button>
            </div>
            <div className="space-y-1">
              {channels.map(c => (
                <div key={c.id} className="group flex items-center gap-1">
                  <button 
                    onClick={() => { setByChannelId(c.id); setActiveTab('dashboard'); }}
                    className={`flex-1 text-left px-4 py-2 rounded-lg text-xs transition-all truncate ${activeChannelId === c.id ? 'bg-slate-800 text-indigo-400 font-bold border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {c.name}
                  </button>
                  <button onClick={() => deleteChannel(c.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* --- MAIN --- */}
      <main className="flex-1 ml-72 h-screen overflow-y-auto">
        <header className="h-20 border-b border-slate-800 flex items-center justify-between px-10 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
          <h2 className="font-bold text-lg">
            {activeChannelId ? `執行頻道：${channels.find(c => c.id === activeChannelId)?.name}` : '系統狀態'}
          </h2>
          <div className="flex items-center gap-4">
             <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
             <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Vercel 部署已就緒</span>
          </div>
        </header>

        <div className="p-10 max-w-5xl mx-auto">
          {activeTab === 'dashboard' && !activeChannelId && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
              {isAdding && (
                <div className="bg-slate-900 p-8 rounded-3xl border-2 border-indigo-500 shadow-2xl">
                  <h3 className="font-bold text-white mb-6">新增頻道</h3>
                  <div className="space-y-4">
                    <input 
                      placeholder="頻道名稱" 
                      value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-sm focus:border-indigo-500 outline-none" 
                    />
                    <input 
                      placeholder="關鍵字" 
                      value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-sm focus:border-indigo-500 outline-none" 
                    />
                    <div className="flex gap-2">
                      <button onClick={createChannel} className="flex-1 bg-indigo-600 py-3.5 rounded-xl text-sm font-bold shadow-lg">建立頻道</button>
                      <button onClick={() => setIsAdding(false)} className="px-4 text-slate-500 text-xs">取消</button>
                    </div>
                  </div>
                </div>
              )}

              {channels.map(c => (
                <div key={c.id} className="bg-slate-900 p-8 rounded-3xl border border-slate-800 hover:border-indigo-500 transition-all group shadow-sm">
                  <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-xl mb-6">📺</div>
                  <h3 className="font-bold text-xl text-white mb-2">{c.name}</h3>
                  <p className="text-xs text-slate-500 mb-8 h-8 line-clamp-2">標籤: {c.searchKeywords.join(', ')}</p>
                  <button 
                    onClick={() => runPipeline(c)}
                    className="w-full py-4 bg-slate-800 group-hover:bg-indigo-600 rounded-2xl text-sm font-bold transition-all shadow-md active:scale-95"
                  >
                    🚀 啟動自動化
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'dashboard' && activeChannelId && (
            <div className="space-y-8 animate-fade-in pb-20">
               <div className="flex items-center justify-between bg-slate-900 p-10 rounded-3xl border border-slate-800 shadow-xl">
                  <div>
                    <h3 className="font-bold text-2xl text-white mb-1">{channels.find(c => c.id === activeChannelId)?.name}</h3>
                    <p className="text-sm text-slate-500 italic">流水線視覺化監測器</p>
                  </div>
                  <button 
                    onClick={() => runPipeline(channels.find(c => c.id === activeChannelId)!)}
                    className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-sm font-bold shadow-lg active:scale-95 transition-all"
                  >
                    重新執行
                  </button>
               </div>

               <div className="space-y-6">
                  <ModuleCard 
                    title="趨勢信號提取" stepNumber="01" description="解析數據頻率"
                    status={getModuleStatus(activeChannelId, 1)}
                    onRunTest={async () => runTrendExtractorTests()}
                    onExecute={() => {}} canExecute={true} data={pipelineStates[activeChannelId]?.data?.logs} testResult={testResults.trend}
                  />

                  <ModuleCard 
                    title="題材候選生成" stepNumber="02" description="Gemini 創意生成"
                    status={getModuleStatus(activeChannelId, 2)}
                    onRunTest={async () => runCandidateGeneratorTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.cand}
                  />

                  <ModuleCard 
                    title="影片生成 (Veo API)" stepNumber="05" description="生成 9:16 短影片資產"
                    status={getModuleStatus(activeChannelId, 5)}
                    onRunTest={async () => runVideoGeneratorTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.video}
                  >
                    {pipelineStates[activeChannelId]?.data?.videoUrl && (
                      <div className="mt-8 rounded-2xl overflow-hidden border border-slate-700 bg-black aspect-[9/16] max-w-[280px] mx-auto shadow-2xl">
                         <video src={pipelineStates[activeChannelId].data.videoUrl} controls className="w-full h-full object-cover" />
                      </div>
                    )}
                  </ModuleCard>

                  <ModuleCard 
                    title="發佈與排程" stepNumber="06" description="YouTube API 上傳"
                    status={getModuleStatus(activeChannelId, 6)}
                    onRunTest={async () => runUploaderTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.uploader}
                  />
               </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
              <div className="p-6 bg-slate-800/50 border-b border-slate-800 font-bold">全系統日誌監控</div>
              <div className="divide-y divide-slate-800 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="p-20 text-center text-slate-600">目前尚無日誌</div>
                ) : logs.map(l => (
                  <div key={l.id} className="p-5 hover:bg-slate-800/20 transition-all flex gap-6">
                    <span className="text-[10px] font-mono text-slate-500 mt-1">{l.timestamp}</span>
                    <div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded mr-3 ${l.level === 'error' ? 'bg-red-900 text-red-400' : 'bg-indigo-900 text-indigo-400'}`}>
                        {l.level.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold text-slate-300">{l.channelName}</span>
                      <p className="text-sm text-slate-400 mt-1">{l.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;