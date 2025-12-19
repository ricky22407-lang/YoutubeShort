
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  var aistudio: AIStudio;
}

const PIPELINE_STAGES = [
  { id: 0, label: "趨勢抓取", desc: "正在查詢 YouTube Data API 熱門 Shorts..." },
  { id: 1, label: "訊號提取", desc: "Gemini 正在分析標題與標籤趨勢..." },
  { id: 2, label: "主題生成", desc: "正在發想高潛力影片主題..." },
  { id: 3, label: "權重衡量", desc: "根據頻道主軸與演算法進行權重評分..." },
  { id: 4, label: "製作內容", desc: "生成 Veo 影片 Prompt 與 YouTube 標題敘述..." },
  { id: 5, label: "影片生成", desc: "Veo 3.1 正在製作 9:16 垂直影片 (這需要約 40-60 秒)..." },
  { id: 6, label: "發佈上傳", desc: "正在上傳至 YouTube Channel..." }
];

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  // New Channel Configuration States
  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech, Gadgets");
  const [newRegion, setNewRegion] = useState("US");
  const [newNiche, setNewNiche] = useState("科技評論與實驗");
  const [newAudience, setNewAudience] = useState("18-35 歲科技愛好者");

  useEffect(() => {
    const init = async () => {
      if (window.aistudio) {
        try {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (e) { console.error(e); }
      }
      
      const saved = localStorage.getItem('sas_channels');
      if (saved) setChannels(JSON.parse(saved));

      // Handle OAuth Callback from URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('sas_pending_auth_id');
      if (code && pendingId) {
        handleAuthCallback(code, pendingId);
      }
      
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels', JSON.stringify(channels));
  }, [channels, isLoading]);

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string, phase?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName,
      level,
      message: String(msg),
      phase: phase ? phase.toUpperCase() : 'SYSTEM'
    }, ...prev].slice(0, 200));
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    addLog(channelId, 'Auth', 'info', '正在交換授權金鑰 (OAuth Token Exchange)...', 'OAUTH');
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'Auth', 'success', 'YouTube 頻道連結成功！現在您可以執行全自動流程。', 'OAUTH');
      } else {
        throw new Error(data.error || "授權交換失敗");
      }
    } catch (e: any) {
      addLog(channelId, 'Auth', 'error', `授權錯誤: ${e.message}`, 'CRITICAL');
    }
  };

  const startAuth = async (channelId: string) => {
    localStorage.setItem('sas_pending_auth_id', channelId);
    try {
      const res = await fetch('/api/auth?action=url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      addLog(channelId, 'Auth', 'error', '無法連線至授權伺服器，請檢查後端配置。', 'CRITICAL');
    }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("請先完成 YouTube 授權連結。");
    
    // Check API Key
    if (!hasApiKey && window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
    }
    
    updateChannel(channel.id, { 
        status: 'running', 
        currentStep: 0, 
        stepLabel: PIPELINE_STAGES[0].desc,
        results: undefined 
    });
    addLog(channel.id, channel.name, 'info', '啟動全自動化管線 (7個階段)...', 'START');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelConfig: channel })
      });

      // 防禦性解析：如果伺服器掛了返回的是 HTML/Text，不要報 Unexpected Token
      const responseText = await res.text();
      let result: PipelineResult;
      
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        throw new Error(`伺服器崩潰或返回非 JSON 格式。原始內容：${responseText.slice(0, 150)}...`);
      }

      if (result.logs) {
        result.logs.forEach(msg => {
            const phase = msg.match(/Phase: (\w+)/)?.[1] || 'PIPELINE';
            addLog(channel.id, channel.name, 'info', msg, phase);
        });
      }

      if (!res.ok || !result.success) {
        throw new Error(result.error || "管線在執行途中發生異常中止。");
      }

      addLog(channel.id, channel.name, 'success', `影片已成功發布！YouTube ID: ${result.uploadId}`, 'FINISH');
      updateChannel(channel.id, { 
        status: 'success', 
        lastRun: new Date().toLocaleString(),
        currentStep: 6,
        stepLabel: '全流程已完成',
        results: {
            trends: result.trends,
            winner: result.winner,
            metadata: result.metadata
        }
      });
    } catch (e: any) {
      const errMsg = e.message || String(e);
      addLog(channel.id, channel.name, 'error', `流程失敗：${errMsg}`, 'CRITICAL');
      updateChannel(channel.id, { status: 'error', stepLabel: '執行中斷' });
    }
  };

  const createChannel = () => {
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "我的新頻道",
      regionCode: newRegion,
      searchKeywords: newKeywords.split(',').map(s => s.trim()),
      channelState: {
          niche: newNiche,
          avg_views: 0,
          target_audience: newAudience
      },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels(prev => [...prev, newChannel]);
    setIsAdding(false);
    // Reset Form
    setNewChannelName("");
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>KERNEL_BOOTING...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-white">S</div>
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Shorts<span className="text-indigo-500 not-italic">Pilot</span></h1>
          </div>
          <div className="flex bg-slate-800 p-1 rounded-2xl shadow-inner">
            <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>控制台</button>
            <button onClick={() => setActiveTab('logs')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>日誌</button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/50">
              <div>
                <h2 className="text-4xl font-black text-white tracking-tight">自動化指揮部</h2>
                <p className="text-slate-500 text-sm mt-1">目前運作中的頻道實例：{channels.length}</p>
              </div>
              <button onClick={() => setIsAdding(true)} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/30 transition-all active:scale-95">+ 建立頻道</button>
            </div>

            {isAdding && (
              <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-10 animate-slide-down shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                <h3 className="text-2xl font-black mb-8 text-white">頻道身份配置 (Account Config)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">頻道名稱</label>
                    <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="例如：AI科技前線" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white font-bold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">主打領域 (Niche)</label>
                    <input value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="影響演算法評分的關鍵..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white font-bold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">目標地區與關鍵字</label>
                    <div className="flex gap-4">
                        <select value={newRegion} onChange={e => setNewRegion(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold">
                          <option value="TW">台灣 (TW)</option>
                          <option value="US">美國 (US)</option>
                          <option value="JP">日本 (JP)</option>
                          <option value="KR">韓國 (KR)</option>
                        </select>
                        <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="AI, Tech..." className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">目標受眾描述</label>
                    <input value={newAudience} onChange={e => setNewAudience(e.target.value)} placeholder="18-35 歲追求新知的年輕人" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white font-bold" />
                  </div>
                </div>
                <div className="flex justify-end gap-4 border-t border-slate-800 pt-8">
                  <button onClick={() => setIsAdding(false)} className="px-8 py-3 text-slate-500 font-bold hover:text-slate-300">放棄</button>
                  <button onClick={createChannel} className="px-12 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-lg shadow-indigo-900/20">保存身份</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 hover:border-slate-600 transition-all shadow-xl group relative overflow-hidden">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 relative z-10">
                    <div className="flex-1">
                      <div className="flex items-center gap-5 mb-3">
                        <h3 className="text-3xl font-black text-white">{channel.name}</h3>
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase shadow-sm ${
                          channel.status === 'running' ? 'bg-indigo-600 text-white animate-pulse' :
                          channel.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                          channel.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'
                        }`}>{channel.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-5 text-slate-400 text-sm font-bold">
                        <span className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-lg">地區: {channel.regionCode}</span>
                        <span className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-lg">主軸: {channel.channelState.niche}</span>
                        {channel.auth ? <span className="text-emerald-500 font-black">✓ 帳號已連動</span> : <span className="text-amber-500 font-black">! 尚未授權</span>}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      {!channel.auth ? (
                         <button onClick={() => startAuth(channel.id)} className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-amber-900/20 transition-all">連結 YouTube 頻道</button>
                      ) : (
                        <button 
                          onClick={() => runAutomation(channel)} 
                          disabled={channel.status === 'running'}
                          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-900/20 transition-all"
                        >
                          {channel.status === 'running' ? '執行中...' : '啟動全自動流程'}
                        </button>
                      )}
                      <button onClick={() => setChannels(channels.filter(c => c.id !== channel.id))} className="p-4 bg-slate-800 text-slate-500 hover:bg-red-600 hover:text-white rounded-2xl transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {channel.status === 'running' && (
                    <div className="mt-10 p-10 bg-slate-950/50 rounded-[2rem] border border-slate-800 animate-fade-in ring-1 ring-indigo-500/30">
                      <div className="flex justify-between items-end mb-6">
                         <div className="space-y-1">
                           <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                             <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
                             PIPELINE_ENGINE_ENGAGED
                           </span>
                           <h4 className="text-2xl font-bold text-white italic">{channel.stepLabel}</h4>
                         </div>
                         <span className="text-sm font-mono text-slate-500 bg-slate-900 px-4 py-1.5 rounded-xl border border-slate-800">STAGE {((channel.currentStep ?? 0) + 1)} / 7</span>
                      </div>
                      <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 transition-all duration-1000 bg-[length:200%_100%] animate-gradient-x"
                          style={{ width: `${((channel.currentStep ?? 0) + 1) * 14.28}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {channel.status === 'success' && channel.results && (
                    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 animate-slide-down">
                        <div className="bg-slate-950/40 p-8 rounded-[2rem] border border-slate-800/50 backdrop-blur-xl">
                           <h4 className="text-[10px] font-black text-slate-500 uppercase mb-5 tracking-[0.2em] flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 抓取到的趨勢數據
                           </h4>
                           <div className="space-y-4">
                             {channel.results.trends?.slice(0, 3).map((t, i) => (
                               <div key={i} className="text-xs text-slate-400 flex justify-between items-center group/item border-b border-slate-800 pb-3 last:border-0">
                                 <span className="truncate max-w-[220px] font-bold group-hover/item:text-white transition-colors">{t.title}</span>
                                 <span className="text-indigo-400 font-black bg-indigo-500/10 px-3 py-1 rounded-lg">{(t.view_count / 1000000).toFixed(1)}M Views</span>
                               </div>
                             ))}
                           </div>
                        </div>
                        <div className="bg-slate-950/40 p-8 rounded-[2rem] border border-slate-800/50 backdrop-blur-xl">
                           <h4 className="text-[10px] font-black text-emerald-500 uppercase mb-5 tracking-[0.2em] flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 生成的 YouTube 內容
                           </h4>
                           <div className="space-y-3">
                             <p className="text-sm font-black text-white leading-tight">標題：{channel.results.metadata?.title_template}</p>
                             <div className="bg-slate-900 p-4 rounded-xl text-[11px] text-slate-500 italic leading-relaxed border border-slate-800">
                                {channel.results.metadata?.description_template}
                             </div>
                           </div>
                        </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-10 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-wider">核心控制台 (Kernel Console)</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-2 flex items-center gap-2">
                   <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                   SYS_LOG_STREAM: VERSION_2.0.8_STABLE
                </p>
              </div>
              <button onClick={() => setLogs([])} className="px-8 py-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white text-xs font-black uppercase rounded-2xl transition-all border border-red-500/20">清除日誌</button>
            </div>
            <div className="h-[700px] overflow-y-auto p-8 font-mono text-[11px] space-y-2 bg-slate-950/80 scroll-smooth">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-800 space-y-4">
                  <svg className="w-16 h-16 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="uppercase tracking-[0.5em] font-black opacity-20 text-xs">Waiting for Pipeline...</span>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex gap-5 p-3 rounded-2xl hover:bg-slate-900 transition-all items-start border border-transparent hover:border-slate-800">
                    <span className="text-slate-600 shrink-0 opacity-50">[{log.timestamp}]</span>
                    <span className={`shrink-0 px-3 py-1 rounded-lg text-[9px] font-black flex items-center shadow-sm ${
                        log.phase === 'CRITICAL' || log.level === 'error' ? 'bg-red-600 text-white' : 
                        log.phase === 'VEO' ? 'bg-purple-600 text-white' :
                        log.phase === 'TRENDS' ? 'bg-indigo-600 text-white' :
                        log.phase === 'OAUTH' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>{log.phase}</span>
                    <span className={`shrink-0 font-black ${log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-emerald-500' : 'text-indigo-400'}`}>
                      @{log.channelName}
                    </span>
                    <span className={`flex-1 leading-relaxed ${log.level === 'error' ? 'text-red-300 bg-red-950/30 px-4 py-2 rounded-xl border border-red-900/40' : 'text-slate-400'}`}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => (<ErrorBoundary><AppContent /></ErrorBoundary>);

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-10">
          <div className="max-w-2xl w-full bg-slate-900 border border-red-900/50 rounded-[4rem] p-16 text-center shadow-2xl">
            <div className="w-24 h-24 bg-red-600/10 text-red-600 rounded-full flex items-center justify-center mx-auto mb-8">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h1 className="text-4xl font-black text-white mb-4 uppercase tracking-tighter">系統崩潰 (Kernel Panic)</h1>
            <div className="bg-black/40 p-8 rounded-3xl mb-10 text-left font-mono text-sm text-red-400 overflow-auto border border-red-900/20 shadow-inner">
              {this.state.error?.message}
            </div>
            <button onClick={() => window.location.reload()} className="px-12 py-5 bg-red-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-red-900/40 transition-all active:scale-95">重啟系統 (Reboot)</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
