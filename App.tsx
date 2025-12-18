import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult, TestResult 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';
import { ModuleCard } from './components/ModuleCard';

// 測試執行器
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

  // 表單狀態
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
    addLog(newChannel.id, 'success', `頻道 ${newChannelName} 設定完成。`);
  };

  const deleteChannel = (id: string) => {
    setChannels(channels.filter(c => c.id !== id));
    if (activeChannelId === id) setByChannelId(null);
  };

  const runPipeline = async (channel: ChannelConfig) => {
    setByChannelId(channel.id);
    setActiveTab('dashboard');
    addLog(channel.id, 'info', '開始執行自動化流水線...');
    
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
        addLog(channel.id, 'success', '全流程自動化成功！');
        setPipelineStates(prev => ({ 
          ...prev, 
          [channel.id]: { status: 'success', data: result, currentStep: 7 } 
        }));
      } else {
        throw new Error(result.error);
      }
    } catch (e: any) {
      addLog(channel.id, 'info', 'API 未偵測，啟動本地模擬展示邏輯...');
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
      addLog(channelId, 'info', `正在執行步驟 0${step}...`);
      await new Promise(r => setTimeout(r, 1000));
    }
    
    addLog(channelId, 'success', '模擬執行完成！影片已生成。');
    setPipelineStates(prev => ({ 
      ...prev, 
      [channelId]: { 
        status: 'success', 
        currentStep: 7,
        data: {
          logs: ["Simulated: Signal Extraction", "Simulated: Prompt Optimized"],
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
    <div className="flex min-h-screen bg-[#020617] text-slate-200 antialiased overflow-hidden">
      
      {/* 側邊欄 */}
      <aside className="w-80 bg-slate-900/40 border-r border-slate-800/60 flex flex-col fixed inset-y-0 z-50 backdrop-blur-xl">
        <div className="p-10">
          <div className="flex items-center gap-4 mb-14 group">
            <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-2xl shadow-indigo-500/20 group-hover:scale-110 transition-all">S</div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white leading-none">Shorts AI</h1>
              <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-1">Automation v2.3</p>
            </div>
          </div>
          
          <nav className="space-y-2">
            <button 
              onClick={() => { setActiveTab('dashboard'); setByChannelId(null); }}
              className={`w-full text-left px-5 py-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'dashboard' && !activeChannelId ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            >
              <span className="text-xl">📊</span> <span className="text-sm font-bold">總覽儀表板</span>
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`w-full text-left px-5 py-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            >
              <span className="text-xl">📜</span> <span className="text-sm font-bold">系統日誌</span>
            </button>
          </nav>

          <div className="mt-16">
            <div className="flex items-center justify-between mb-6 px-3">
               <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">頻道監控列表</p>
               <button onClick={() => setIsAdding(true)} className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all text-sm">+</button>
            </div>
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {channels.map(c => (
                <div key={c.id} className="group flex items-center gap-1">
                  <button 
                    onClick={() => { setByChannelId(c.id); setActiveTab('dashboard'); }}
                    className={`flex-1 text-left px-5 py-3 rounded-xl text-xs transition-all truncate border ${activeChannelId === c.id ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30' : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/30'}`}
                  >
                    {c.name}
                  </button>
                  <button onClick={() => deleteChannel(c.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-auto p-8 border-t border-slate-800/40">
           <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]"></div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Gemini Engine Online</span>
           </div>
        </div>
      </aside>

      {/* 主介面 */}
      <main className="flex-1 ml-80 h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950">
        <header className="h-24 border-b border-slate-800/50 flex items-center justify-between px-12 bg-slate-950/60 backdrop-blur-md sticky top-0 z-40">
          <div>
            <h2 className="font-black text-2xl text-white tracking-tight">
              {activeChannelId ? channels.find(c => c.id === activeChannelId)?.name : '系統概覽 Dashboard'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">YouTube Shorts 自動化核心控制台</p>
          </div>
          <div className="flex items-center gap-8">
             <div className="text-right">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">每日剩餘額度</p>
                <p className="text-lg font-mono font-black text-indigo-400">92 / 100</p>
             </div>
             <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 text-xl shadow-inner">
                👤
             </div>
          </div>
        </header>

        <div className="p-12 max-w-6xl mx-auto">
          {activeTab === 'dashboard' && !activeChannelId && (
            <div className="space-y-10 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {isAdding && (
                  <div className="bg-slate-900/60 p-10 rounded-[2.5rem] border-2 border-indigo-500/40 ring-8 ring-indigo-500/5 shadow-2xl animate-slide-down">
                    <h3 className="font-black text-xl text-white mb-8">建立新監控頻道</h3>
                    <div className="space-y-6">
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-2 block tracking-widest">頻道名稱</label>
                        <input 
                          placeholder="例如: AI News Hub" 
                          value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-black text-slate-500 uppercase mb-2 block tracking-widest">核心搜尋標籤</label>
                        <input 
                          placeholder="例如: 科學, 實驗" 
                          value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                        />
                      </div>
                      <button onClick={createChannel} className="w-full bg-indigo-600 hover:bg-indigo-500 py-5 rounded-2xl text-sm font-black shadow-2xl shadow-indigo-500/30 transition-all transform active:scale-95">確認並儲存</button>
                      <button onClick={() => setIsAdding(false)} className="w-full text-slate-500 text-xs py-2 font-bold uppercase tracking-widest">取消</button>
                    </div>
                  </div>
                )}

                {channels.map(c => (
                  <div key={c.id} className="bg-slate-900/40 p-10 rounded-[2.5rem] border border-slate-800/60 hover:border-indigo-500/40 hover:bg-slate-900/60 transition-all group relative overflow-hidden shadow-sm">
                    <div className="flex justify-between items-start mb-10">
                      <div className="w-16 h-16 bg-slate-800 rounded-[1.25rem] flex items-center justify-center text-3xl shadow-inner border border-slate-700/50">📺</div>
                      <div className="px-3 py-1 bg-indigo-500/10 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-widest border border-indigo-500/20">
                        {c.status}
                      </div>
                    </div>
                    <h3 className="font-black text-2xl text-white mb-3">{c.name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed h-12 mb-10">搜尋策略: {c.searchKeywords.join(', ')}</p>
                    <button 
                      onClick={() => runPipeline(c)}
                      className="w-full py-5 bg-slate-800 group-hover:bg-indigo-600 rounded-2xl text-sm font-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3"
                    >
                      🚀 啟動完整流程
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && activeChannelId && (
            <div className="space-y-10 animate-fade-in pb-24">
               <div className="flex items-center justify-between bg-slate-900/40 p-12 rounded-[3rem] border border-slate-800/60 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center gap-8">
                    <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center text-4xl border border-indigo-500/20 shadow-inner">⚡</div>
                    <div>
                      <h3 className="font-black text-3xl text-white mb-2">{channels.find(c => c.id === activeChannelId)?.name}</h3>
                      <p className="text-sm text-slate-400 font-medium">即時流水線視覺化監測中</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => runPipeline(channels.find(c => c.id === activeChannelId)!)}
                    className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-sm font-black shadow-2xl shadow-indigo-500/30 active:scale-95 transition-all"
                  >
                    重新執行所有模組
                  </button>
               </div>

               <div className="space-y-8 max-w-4xl mx-auto">
                  <ModuleCard 
                    title="趨勢信號提取" stepNumber="01" description="從 YouTube 數據庫抓取並解析最熱門關鍵字與頻率"
                    status={getModuleStatus(activeChannelId, 1)}
                    onRunTest={async () => runTrendExtractorTests()}
                    onExecute={() => {}} canExecute={true} data={pipelineStates[activeChannelId]?.data?.logs} testResult={testResults.trend}
                  />

                  <ModuleCard 
                    title="題材候選生成" stepNumber="02" description="Gemini 生成 3 個具備病毒式傳播潛力的影片構思"
                    status={getModuleStatus(activeChannelId, 2)}
                    onRunTest={async () => runCandidateGeneratorTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.cand}
                  />

                  <ModuleCard 
                    title="影片資產排版" stepNumber="04" description="撰寫精確的影片 Prompt、標題與 SEO 描述標籤"
                    status={getModuleStatus(activeChannelId, 4)}
                    onRunTest={async () => runPromptComposerTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.composer}
                  />

                  <ModuleCard 
                    title="影片生成 (Veo 3.1)" stepNumber="05" description="呼叫 Google Veo 核心生成 9:16 高解析短影片"
                    status={getModuleStatus(activeChannelId, 5)}
                    onRunTest={async () => runVideoGeneratorTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.video}
                  >
                    {pipelineStates[activeChannelId]?.data?.videoUrl && (
                      <div className="mt-12 rounded-[2.5rem] overflow-hidden border-8 border-slate-900 bg-black aspect-[9/16] max-w-[320px] mx-auto shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                         <video src={pipelineStates[activeChannelId].data.videoUrl} controls className="w-full h-full object-cover" />
                      </div>
                    )}
                  </ModuleCard>

                  <ModuleCard 
                    title="上傳與排程發佈" stepNumber="06" description="自動推送影片至 YouTube 頻道並設定隱私狀態"
                    status={getModuleStatus(activeChannelId, 6)}
                    onRunTest={async () => runUploaderTests()}
                    onExecute={() => {}} canExecute={true} data={null} testResult={testResults.uploader}
                  />
               </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-slate-900/60 rounded-[3rem] border border-slate-800/60 overflow-hidden animate-fade-in shadow-2xl">
              <div className="p-10 bg-slate-800/40 border-b border-slate-800/60 flex justify-between items-center">
                 <span className="font-black text-white text-lg tracking-tight">核心系統全活動日誌</span>
                 <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-red-400 transition-colors font-black uppercase tracking-widest">清除記錄</button>
              </div>
              <div className="divide-y divide-slate-800/40 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="p-32 text-center text-slate-600 font-bold italic">目前尚無活動日誌記錄</div>
                ) : logs.map(l => (
                  <div key={l.id} className="p-8 hover:bg-slate-800/20 transition-all flex gap-8 group">
                    <span className="text-[11px] font-mono text-slate-600 mt-1.5">{l.timestamp}</span>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full ${l.level === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                          {l.level.toUpperCase()}
                        </span>
                        <span className="text-sm font-black text-slate-300 group-hover:text-indigo-400 transition-colors">{l.channelName}</span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed font-medium">{l.message}</p>
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