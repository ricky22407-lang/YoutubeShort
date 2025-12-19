
import React, { useState, useEffect, Component, ReactNode } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';

const PIPELINE_STEPS = [
  { id: 'analyze', label: "AI 企劃階段", desc: "正在分析趨勢並編寫腳本..." },
  { id: 'video', label: "影片生成階段", desc: "Veo 3.1 正在渲染 9:16 影片 (約 45s)..." },
  { id: 'upload', label: "發布上傳階段", desc: "正在同步至 YouTube 頻道..." }
];

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Fix: Use the imported Component class to ensure that TypeScript correctly identifies 'this.props' and 'this.state'
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState { 
    return { hasError: true, error }; 
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-12 font-mono">
          <div className="max-w-xl w-full bg-slate-900 border border-red-900/30 rounded-[3rem] p-16 text-center shadow-2xl">
            <h1 className="text-3xl font-black text-red-500 mb-6 italic">KERNEL_CRASH</h1>
            <div className="bg-black/50 p-8 rounded-2xl mb-10 text-left text-xs text-red-400 overflow-auto border border-red-900/20 max-h-48">
              {this.state.error?.message}
            </div>
            <button onClick={() => window.location.reload()} className="px-12 py-5 bg-red-600 text-white rounded-2xl font-black">REBOOT SYSTEM</button>
          </div>
        </div>
      );
    }
    // Correctly access children from the inherited props property
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [sysStatus, setSysStatus] = useState<{api_key: boolean, oauth: boolean, is_mock?: boolean} | null>(null);
  const [apiPrefix, setApiPrefix] = useState<string>('/api');
  const [needsApiKey, setNeedsApiKey] = useState(false);

  const [newChannelName, setNewChannelName] = useState("");
  const [newNiche, setNewNiche] = useState("AI 自動化工具實測");

  const checkSystem = async () => {
    const tryPrefixes = ['/api', ''];
    for (const prefix of tryPrefixes) {
      try {
        const res = await fetch(`${prefix}/auth?action=check`);
        if (res.ok) {
          const data = await res.json();
          setSysStatus(data);
          setApiPrefix(prefix);
          return;
        }
      } catch (e) { /* ignore */ }
    }
    setSysStatus({ api_key: true, oauth: true, is_mock: true });
    addLog('system', 'System', 'info', '後端 API 未回應，已自動切換至展示模擬模式。', 'INIT');
  };

  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          setNeedsApiKey(true);
          setIsLoading(false);
          return;
        }
      }

      await checkSystem();
      const saved = localStorage.getItem('sas_channels_v6');
      if (saved) setChannels(JSON.parse(saved));
      
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('sas_pending_auth_id');
      if (code && pendingId) handleAuthCallback(code, pendingId);
      
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels_v6', JSON.stringify(channels));
  }, [channels, isLoading]);

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string, phase?: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId, channelName, level, message: String(msg),
      phase: phase ? phase.toUpperCase() : 'SYSTEM'
    }, ...prev].slice(0, 100));
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    addLog(channelId, 'Auth', 'info', '正在完成授權令牌交換...', 'OAUTH');
    try {
      const res = await fetch(`${apiPrefix}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'Auth', 'success', 'YouTube 頻道連結成功！', 'OAUTH');
      }
    } catch (e: any) { addLog(channelId, 'Auth', 'error', `授權失敗: ${e.message}`, 'CRITICAL'); }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (sysStatus?.is_mock) return runMockAutomation(channel);
    if (!channel.auth) return alert("請先連結 YouTube 帳號。");
    
    updateChannel(channel.id, { status: 'running', currentStep: 0, stepLabel: PIPELINE_STEPS[0].desc });
    addLog(channel.id, channel.name, 'info', '啟動分段式自動化管線...', 'START');

    try {
      const data1 = await safeFetch(`${apiPrefix}/pipeline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channelConfig: channel })
      });
      
      if (!data1.success) {
        // 特別處理 API 未啟用錯誤
        if (data1.error && data1.error.includes("CRITICAL_API_DISABLED")) {
            addLog(channel.id, channel.name, 'error', "❌ 關鍵錯誤：您的 YouTube API 未在 Google Cloud Console 啟用。", 'CONFIG');
            addLog(channel.id, channel.name, 'info', "請前往啟用：https://console.cloud.google.com/apis/library/youtube.googleapis.com", 'CONFIG');
            throw new Error("YouTube API 未啟用");
        }
        throw new Error(data1.error || "企劃階段失敗");
      }
      
      data1.logs?.forEach((l: string) => addLog(channel.id, channel.name, 'info', l, 'ANALYZE'));

      updateChannel(channel.id, { currentStep: 1, stepLabel: PIPELINE_STEPS[1].desc });
      const data2 = await safeFetch(`${apiPrefix}/pipeline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'video', metadata: data1.metadata })
      });
      if (!data2.success) throw new Error(data2.error || "影片生成失敗");
      data2.logs?.forEach((l: string) => addLog(channel.id, channel.name, 'info', l, 'VEO'));

      updateChannel(channel.id, { currentStep: 2, stepLabel: PIPELINE_STEPS[2].desc });
      const data3 = await safeFetch(`${apiPrefix}/pipeline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'upload', channelConfig: channel, metadata: data1.metadata, videoAsset: data2.videoAsset })
      });
      if (!data3.success) throw new Error(data3.error || "發布階段失敗");
      
      addLog(channel.id, channel.name, 'success', `流程完成！ID: ${data3.uploadId}`, 'FINISH');
      updateChannel(channel.id, { 
        status: 'success', currentStep: 3, stepLabel: '已完成',
        results: { trends: data1.trends, winner: data1.winner, metadata: data1.metadata }
      });
    } catch (e: any) {
      addLog(channel.id, channel.name, 'error', `管線失敗: ${e.message}`, 'CRITICAL');
      updateChannel(channel.id, { status: 'error', stepLabel: '執行中斷' });
    }
  };

  const runMockAutomation = async (channel: ChannelConfig) => {
    updateChannel(channel.id, { status: 'running', currentStep: 0, stepLabel: "正在模擬趨勢分析..." });
    await new Promise(r => setTimeout(r, 1500));
    addLog(channel.id, channel.name, 'info', '模擬分析完成：發現熱門寵物短片趨勢。', 'MOCK');
    
    updateChannel(channel.id, { currentStep: 1, stepLabel: "正在模擬影片生成 (Veo 渲染)..." });
    await new Promise(r => setTimeout(r, 2000));
    addLog(channel.id, channel.name, 'info', '模擬渲染完成：生成 9:16 MP4 預覽。', 'MOCK');

    updateChannel(channel.id, { currentStep: 2, stepLabel: "正在模擬上傳發布..." });
    await new Promise(r => setTimeout(r, 1000));
    addLog(channel.id, channel.name, 'success', '模擬流程圓滿完成！', 'MOCK');
    
    updateChannel(channel.id, { 
        status: 'success', currentStep: 3, stepLabel: '模擬完成',
        results: { winner: { subject_type: '黃金獵犬', action_verb: '跳舞', id: 'm1' } as any }
    });
  };

  const safeFetch = async (url: string, options: any) => {
    const res = await fetch(url, options);
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`伺服器回應格式錯誤: ${text.slice(0, 50)}...`);
    }
  };

  const createChannel = () => {
    const newChan: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "我的頻道",
      regionCode: "TW",
      searchKeywords: ["AI"],
      channelState: { niche: newNiche, avg_views: 0, target_audience: "科技愛好者" },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels([...channels, newChan]);
    setIsAdding(false);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500 font-mono italic animate-pulse">BOOTING_v6_CORE...</div>;

  if (needsApiKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-3xl max-w-md text-center shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-4 italic">API_KEY_REQUIRED</h2>
          <p className="text-slate-400 mb-8 text-sm">
            本應用程式使用 Veo 進行影片生成，您需要先選擇一個已啟用計費的 API 金鑰。
            請前往 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 underline">計費文件</a> 瞭解更多資訊。
          </p>
          <button 
            onClick={async () => {
              await (window as any).aistudio.openSelectKey();
              setNeedsApiKey(false);
              setIsLoading(true);
              window.location.reload();
            }} 
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-900/20"
          >
            開啟金鑰選擇器
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-lg shadow-indigo-500/20">S</div>
          <h1 className="text-xl font-black uppercase italic tracking-tighter">Shorts<span className="text-indigo-500">Pilot</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className={`hidden md:flex gap-3 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border ${sysStatus?.is_mock ? 'bg-amber-900/20 border-amber-700 text-amber-500' : 'bg-slate-800 border-slate-700'}`}>
             <span>MODE: {sysStatus?.is_mock ? "SIMULATED" : "PRODUCTION"}</span>
             {!sysStatus?.is_mock && <span className={sysStatus?.api_key ? "text-emerald-500" : "text-red-500"}>API: {sysStatus?.api_key ? "OK" : "ERR"}</span>}
          </div>
          <button onClick={() => setActiveTab('dashboard')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>控制台</button>
          <button onClick={() => setActiveTab('logs')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>日誌</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end bg-slate-900/40 p-10 rounded-[2rem] border border-slate-800/50">
               <div>
                 <h2 className="text-4xl font-black text-white tracking-tight italic uppercase">Shorts Automation</h2>
                 <p className="text-slate-500 text-sm mt-2">版本 v6.0.2 | {sysStatus?.is_mock ? "目前正以展示模式執行，部分功能僅作模擬。" : "伺服器通訊正常。"}</p>
               </div>
               <button onClick={() => setIsAdding(true)} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/30 transition-all">+ 新增頻道</button>
            </div>

            {isAdding && (
               <div className="bg-slate-900 border border-slate-700 rounded-[2rem] p-10 animate-slide-down">
                 <div className="grid grid-cols-2 gap-8 mb-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">頻道標籤</label>
                      <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="我的科技頻道" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">主軸 Niche</label>
                      <input value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="AI 生活應用" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                 </div>
                 <div className="flex justify-end gap-4">
                    <button onClick={() => setIsAdding(false)} className="px-6 py-2 text-slate-500 font-bold">取消</button>
                    <button onClick={createChannel} className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-black">建立並儲存</button>
                 </div>
               </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 hover:border-slate-700 transition-all relative overflow-hidden group">
                  <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-8 relative z-10">
                    <div className="flex-1">
                       <div className="flex items-center gap-4 mb-4">
                         <h3 className="text-2xl font-black text-white">{channel.name}</h3>
                         <span className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase ${channel.status === 'running' ? 'bg-indigo-600 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>{channel.status}</span>
                       </div>
                       <div className="flex gap-4 text-xs font-bold text-slate-500 uppercase italic">
                         <span className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">{channel.channelState.niche}</span>
                         {channel.auth || sysStatus?.is_mock ? <span className="text-emerald-500 self-center">✓ 狀態正常</span> : <span className="text-amber-500 self-center">! 未連動 YouTube</span>}
                       </div>
                    </div>
                    <div className="flex gap-4">
                      {(!channel.auth && !sysStatus?.is_mock) ? (
                         <button onClick={() => { localStorage.setItem('sas_pending_auth_id', channel.id); fetch(`${apiPrefix}/auth?action=url`).then(r => r.json()).then(d => window.location.href = d.url); }} className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black shadow-lg">連結 YouTube</button>
                      ) : (
                        <button onClick={() => runAutomation(channel)} disabled={channel.status === 'running'} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-black shadow-xl transition-all">
                          {channel.status === 'running' ? '管線執行中...' : '執行自動流程'}
                        </button>
                      )}
                      <button onClick={() => setChannels(channels.filter(c => c.id !== channel.id))} className="p-4 bg-slate-800 hover:bg-red-600 text-slate-500 hover:text-white rounded-2xl transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 00-16.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {channel.status === 'running' && (
                    <div className="mt-8 p-8 bg-slate-950/50 rounded-3xl border border-slate-800 ring-1 ring-indigo-500/20 animate-fade-in">
                      <div className="flex justify-between items-end mb-6">
                         <div className="space-y-1">
                           <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                             <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></span>
                             PIPELINE_ACTIVE
                           </span>
                           <h4 className="text-xl font-bold text-white italic">{channel.stepLabel}</h4>
                         </div>
                         <span className="text-xs font-mono text-slate-600">STG {channel.currentStep! + 1} / 3</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 transition-all duration-1000 ease-out" style={{ width: `${(channel.currentStep! + 1) * 33.3}%` }}></div>
                      </div>
                    </div>
                  )}

                  {channel.status === 'success' && (
                     <div className="mt-8 p-6 bg-slate-950 rounded-3xl border border-slate-800 animate-slide-down">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">最近一次執行結果</h4>
                            <span className="text-[10px] font-mono text-slate-500">{new Date().toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-3 text-emerald-400 font-bold italic text-sm">✅ 影片已生成並完成虛擬上傳。</p>
                     </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-xl font-black text-white uppercase tracking-widest italic">Core Logs</h3>
              <button onClick={() => setLogs([])} className="text-[10px] font-black text-red-500 uppercase bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Clear Logs</button>
            </div>
            <div className="h-[600px] overflow-y-auto p-8 font-mono text-[10px] space-y-2 bg-slate-950/80">
              {logs.map(log => (
                <div key={log.id} className="flex gap-4 p-3 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 group">
                  <span className="text-slate-600 shrink-0 opacity-40">[{log.timestamp}]</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black ${log.level === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'}`}>{log.phase || 'SYSTEM'}</span>
                  <span className={`shrink-0 font-black ${log.level === 'error' ? 'text-red-500' : 'text-indigo-400'}`}>@{log.channelName}</span>
                  <span className={log.level === 'error' ? 'text-red-300' : 'text-slate-400 group-hover:text-slate-200'}>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => (<ErrorBoundary><AppContent /></ErrorBoundary>);

export default App;
