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
  
  // Pipeline state tracks progress per channel
  // status: 'idle' | 'running' | 'success' | 'error'
  // currentStep: number
  const [pipelineStates, setPipelineStates] = useState<Record<string, any>>({});
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  // Form State
  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech, Science");

  useEffect(() => {
    const saved = localStorage.getItem('sas_channels_v2');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('sas_channels_v2', JSON.stringify(channels));
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
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "未命名頻道",
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
  };

  const deleteChannel = (id: string) => {
    setChannels(channels.filter(c => c.id !== id));
    if (activeChannelId === id) setByChannelId(null);
  };

  const runPipeline = async (channel: ChannelConfig) => {
    setByChannelId(channel.id);
    setPipelineStates(prev => ({ 
      ...prev, 
      [channel.id]: { currentStep: 1, status: 'running', logs: [] } 
    }));
    addLog(channel.id, 'info', '開始執行全自動流水線...');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelConfig: channel })
      });
      const result: PipelineResult = await res.json();
      
      if (result.success) {
        addLog(channel.id, 'success', '全自動流水線完成！影片已生成。');
        setPipelineStates(prev => ({ 
          ...prev, 
          [channel.id]: { ...prev[channel.id], status: 'success', data: result, currentStep: 7 } 
        }));
      } else {
        addLog(channel.id, 'error', `流水線中斷: ${result.error}`);
        setPipelineStates(prev => ({ 
          ...prev, 
          [channel.id]: { ...prev[channel.id], status: 'error', error: result.error } 
        }));
      }
    } catch (e: any) {
      addLog(channel.id, 'error', `API 連線錯誤: ${e.message}`);
      setPipelineStates(prev => ({ 
        ...prev, 
        [channel.id]: { ...prev[channel.id], status: 'error', error: e.message } 
      }));
    }
  };

  const getModuleStatus = (channelId: string, step: number) => {
    const state = pipelineStates[channelId];
    if (!state) return 'idle';
    if (state.status === 'error' && state.currentStep === step) return 'error';
    if (state.currentStep > step || state.status === 'success') return 'success';
    if (state.currentStep === step && state.status === 'running') return 'loading';
    return 'idle';
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-72 bg-slate-900/50 border-r border-slate-800/60 backdrop-blur-xl flex flex-col fixed inset-y-0 z-50">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10 group cursor-default">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center font-black text-white shadow-xl shadow-indigo-500/20 group-hover:scale-110 transition-transform">S</div>
            <h1 className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Shorts AI</h1>
          </div>
          
          <nav className="space-y-1.5">
            <button 
              onClick={() => { setActiveTab('dashboard'); setByChannelId(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 ${activeTab === 'dashboard' && !activeChannelId ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            >
              <span className="text-lg">📊</span> <span className="font-medium text-sm">主儀表板</span>
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            >
              <span className="text-lg">📜</span> <span className="font-medium text-sm">系統日誌</span>
            </button>
          </nav>

          <div className="mt-12">
            <div className="flex items-center justify-between mb-4 px-2">
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">頻道列表</p>
               <button onClick={() => setIsAdding(true)} className="text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-colors">+ 新增</button>
            </div>
            <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {channels.map(c => (
                <div key={c.id} className="group flex items-center gap-1">
                  <button 
                    onClick={() => { setByChannelId(c.id); setActiveTab('dashboard'); }}
                    className={`flex-1 text-left px-4 py-2.5 rounded-lg text-xs transition-all truncate border ${activeChannelId === c.id ? 'bg-slate-800/80 text-indigo-400 border-slate-700 shadow-sm' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                  >
                    {c.name}
                  </button>
                  <button onClick={() => deleteChannel(c.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all">×</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-slate-800/50">
           <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">伺服器狀態</p>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                 <span className="text-xs font-medium text-slate-300">Gemini Pro API 已連線</span>
              </div>
           </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 ml-72">
        <header className="h-20 border-b border-slate-800/60 flex items-center justify-between px-10 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
          <div>
            <h2 className="font-bold text-lg text-white">
              {activeChannelId ? `頻道管理：${channels.find(c => c.id === activeChannelId)?.name}` : '系統狀態概覽'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">自動化短影片流水線 v2.3.0</p>
          </div>
          <div className="flex items-center gap-6">
             <div className="text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase">今日額度</p>
                <p className="text-sm font-mono text-indigo-400">84% 剩餘</p>
             </div>
             <div className="w-px h-8 bg-slate-800"></div>
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400">
                  <span className="text-xl">👤</span>
                </div>
             </div>
          </div>
        </header>

        <div className="p-10 max-w-6xl mx-auto">
          {activeTab === 'dashboard' && !activeChannelId && (
            <div className="space-y-8 animate-fade-in">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { label: '累積生成影片', value: '1,284', color: 'indigo' },
                  { label: '平均觀看增長', value: '+42.5%', color: 'emerald' },
                  { label: '活躍頻道數', value: channels.length, color: 'violet' }
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-900/40 border border-slate-800/60 p-6 rounded-2xl hover:bg-slate-900/60 transition-colors">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
                    <p className={`text-3xl font-black text-${stat.color}-400 tracking-tight`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isAdding && (
                  <div className="bg-slate-900/80 p-8 rounded-3xl border-2 border-indigo-500/40 ring-4 ring-indigo-500/5 shadow-2xl animate-slide-down">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg text-white">設定自動化頻道</h3>
                      <button onClick={() => setIsAdding(false)} className="text-slate-500 hover:text-white">✕</button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">頻道名稱</label>
                        <input 
                          placeholder="例如: AI 實驗室" 
                          value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">核心關鍵字 (分析用)</label>
                        <input 
                          placeholder="例如: 科技, 解謎, 動畫" 
                          value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                        />
                      </div>
                      <button onClick={createChannel} className="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl text-sm font-bold shadow-xl shadow-indigo-500/20 transition-all mt-4">完成設定</button>
                    </div>
                  </div>
                )}

                {channels.map(c => (
                  <div key={c.id} className="bg-slate-900/40 p-8 rounded-3xl border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-900/60 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600/0 group-hover:bg-indigo-600 transition-all"></div>
                    <div className="flex justify-between items-start mb-8">
                      <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-slate-700/50">📺</div>
                      <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${c.status === 'idle' ? 'bg-slate-800 text-slate-500' : 'bg-indigo-500/20 text-indigo-400'}`}>
                        {c.status}
                      </div>
                    </div>
                    <h3 className="font-bold text-xl text-white mb-2">{c.name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-8">分析標籤: {c.searchKeywords.join(', ')}</p>
                    
                    <button 
                      onClick={() => runPipeline(c)}
                      className="w-full py-4 bg-slate-800 group-hover:bg-indigo-600 rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-95"
                    >
                      🚀 啟動全自動化流程
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && activeChannelId && (
            <div className="max-w-4xl mx-auto space-y-10 animate-fade-in pb-20">
               <div className="flex items-center justify-between bg-slate-900/40 p-10 rounded-3xl border border-slate-800/60 shadow-xl">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-indigo-600/10 rounded-2xl flex items-center justify-center text-3xl border border-indigo-500/20">⚙️</div>
                    <div>
                      <h3 className="font-bold text-2xl text-white mb-1">{channels.find(c => c.id === activeChannelId)?.name}</h3>
                      <p className="text-sm text-slate-500">正在監控 7 階段自動化流水線執行狀態</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => runPipeline(channels.find(c => c.id === activeChannelId)!)}
                    className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-sm font-bold shadow-2xl shadow-indigo-500/20 active:scale-95 transition-all"
                  >
                    立即執行更新
                  </button>
               </div>

               <div className="space-y-6">
                  <ModuleCard 
                    title="趨勢信號提取" stepNumber="01" description="從 YouTube 抓取原始數據並提取核心關鍵字與頻率"
                    status={getModuleStatus(activeChannelId, 1)}
                    onRunTest={async () => { const res = await runTrendExtractorTests(); setTestResults(p => ({...p, trend: res})); return res; }}
                    onExecute={() => {}} canExecute={true} data={pipelineStates[activeChannelId]?.data?.logs?.find((l: string) => l.includes('extracted'))} testResult={testResults.trend || null}
                  />

                  <ModuleCard 
                    title="題材候選生成" stepNumber="02" description="Gemini 根據趨勢數據設計 3 個病毒式傳播題材"
                    status={getModuleStatus(activeChannelId, 2)}
                    onRunTest={async () => { const res = await runCandidateGeneratorTests(); setTestResults(p => ({...p, cand: res})); return res; }}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.cand || null}
                  />

                  <ModuleCard 
                    title="權重評分引擎" stepNumber="03" description="評估題材與頻道屬性的契合度並選出最優解"
                    status={getModuleStatus(activeChannelId, 3)}
                    onRunTest={async () => { const res = await runWeightEngineTests(); setTestResults(p => ({...p, weight: res})); return res; }}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.weight || null}
                  />

                  <ModuleCard 
                    title="影片資產排版" stepNumber="04" description="生成影片 Prompt、點擊標題與 SEO 描述"
                    status={getModuleStatus(activeChannelId, 4)}
                    onRunTest={async () => { const res = await runPromptComposerTests(); setTestResults(p => ({...p, composer: res})); return res; }}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.composer || null}
                  />

                  <ModuleCard 
                    title="影片生成 (Veo API)" stepNumber="05" description="呼叫 Google Veo 生成高畫質 9:16 短影片資產"
                    status={getModuleStatus(activeChannelId, 5)}
                    onRunTest={async () => { const res = await runVideoGeneratorTests(); setTestResults(p => ({...p, video: res})); return res; }}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.video || null}
                  >
                    {pipelineStates[activeChannelId]?.data?.videoUrl && (
                      <div className="mt-8 rounded-3xl overflow-hidden border border-slate-700/50 bg-black aspect-[9/16] max-w-[320px] mx-auto shadow-2xl ring-8 ring-slate-900">
                         <video src={pipelineStates[activeChannelId].data.videoUrl} controls className="w-full h-full object-cover" />
                      </div>
                    )}
                  </ModuleCard>

                  <ModuleCard 
                    title="平台發佈與排程" stepNumber="06" description="自動上傳至 YouTube 並設定發佈狀態"
                    status={getModuleStatus(activeChannelId, 6)}
                    onRunTest={async () => { const res = await runUploaderTests(); setTestResults(p => ({...p, uploader: res})); return res; }}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.uploader || null}
                  />
               </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-slate-900/60 rounded-3xl border border-slate-800/60 overflow-hidden animate-fade-in shadow-2xl">
              <div className="p-6 bg-slate-800/40 border-b border-slate-800/60 flex justify-between items-center">
                 <span className="font-bold text-white tracking-tight">系統全日誌監控</span>
                 <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-red-400 transition-colors uppercase font-black">清除所有記錄</button>
              </div>
              <div className="divide-y divide-slate-800/40 max-h-[75vh] overflow-y-auto custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="p-20 text-center flex flex-col items-center">
                    <span className="text-4xl mb-4">🏜️</span>
                    <p className="text-slate-500 italic text-sm">目前沒有任何系統活動記錄</p>
                  </div>
                ) : logs.map(l => (
                  <div key={l.id} className="p-6 hover:bg-slate-800/20 transition-all flex gap-6 group">
                    <span className="text-[11px] font-mono text-slate-600 mt-1">{l.timestamp}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${l.level === 'error' ? 'bg-red-500/20 text-red-400' : l.level === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                          {l.level.toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-slate-300 group-hover:text-indigo-400 transition-colors">{l.channelName}</span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">{l.message}</p>
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