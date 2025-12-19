
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';

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
  { id: 5, label: "影片生成", desc: "Veo 3.1 正在製作 9:16 垂直影片 (約需 45s)..." },
  { id: 6, label: "發佈上傳", desc: "正在上傳至 YouTube Channel..." }
];

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [sysStatus, setSysStatus] = useState<{api_key: boolean, oauth: boolean} | null>(null);

  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech, Science");
  const [newRegion, setNewRegion] = useState("TW");
  const [newNiche, setNewNiche] = useState("AI 自動化工具實測");
  const [newAudience, setNewAudience] = useState("18-35 歲科技愛好者");

  const checkSystem = async () => {
    try {
      const res = await fetch('/api/auth?action=check');
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setSysStatus(data);
      } else {
        console.warn("SysCheck 回傳了非 JSON 格式，可能是伺服器報錯頁面。");
      }
    } catch (e) {
      console.error("SysCheck 網路錯誤", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await checkSystem();
      const saved = localStorage.getItem('sas_channels_v3');
      if (saved) setChannels(JSON.parse(saved));
      
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
    if (!isLoading) localStorage.setItem('sas_channels_v3', JSON.stringify(channels));
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
    addLog(channelId, 'Auth', 'info', '正在完成安全令牌交換...', 'OAUTH');
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'Auth', 'success', 'YouTube 頻道連結成功！', 'OAUTH');
      } else {
        throw new Error(data.error || "授權流程被中斷");
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
      addLog(channelId, 'Auth', 'error', '無法啟動 OAuth 授權中心。', 'CRITICAL');
    }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("請先完成 YouTube 授權。");
    
    updateChannel(channel.id, { 
        status: 'running', 
        currentStep: 0, 
        stepLabel: PIPELINE_STAGES[0].desc,
        results: undefined 
    });
    addLog(channel.id, channel.name, 'info', '初始化全自動管線引擎...', 'START');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelConfig: channel })
      });

      const responseText = await res.text();
      let result: PipelineResult;
      
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        const errorSummary = responseText.includes('FUNCTION_INVOCATION_FAILED') 
          ? "伺服器函數執行超時或內部崩潰 (Vercel Timeout)" 
          : responseText.slice(0, 100);
        throw new Error(`系統核心解析失敗。原始訊息：${errorSummary}`);
      }

      if (result.logs) {
        result.logs.forEach(msg => {
            const phase = msg.match(/Phase: (\w+)/)?.[1] || 'PIPELINE';
            addLog(channel.id, channel.name, 'info', msg, phase);
        });
      }

      if (!res.ok || !result.success) {
        throw new Error(result.error || "管線任務在執行途中中斷。");
      }

      addLog(channel.id, channel.name, 'success', `影片上傳完成！ID: ${result.uploadId}`, 'FINISH');
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
      addLog(channel.id, channel.name, 'error', `流程失敗: ${e.message}`, 'CRITICAL');
      updateChannel(channel.id, { status: 'error', stepLabel: '執行中斷' });
    }
  };

  const createChannel = () => {
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
      name: newChannelName || "預設頻道",
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
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono italic animate-pulse">BOOTING_CORE_V3...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-white italic">S</div>
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Shorts<span className="text-indigo-500 not-italic">Pilot</span></h1>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={checkSystem} className="text-[9px] font-black uppercase tracking-widest bg-slate-800 px-3 py-1 rounded hover:bg-slate-700 transition-colors">刷新系統狀態</button>
            <div className="hidden lg:flex gap-4 text-[9px] font-black uppercase tracking-widest bg-slate-800 px-4 py-2 rounded-xl border border-slate-700">
                <span className={sysStatus?.api_key ? "text-emerald-500" : "text-red-500"}>GEMINI_API: {sysStatus?.api_key ? "OK" : "MISSING"}</span>
                <span className={sysStatus?.oauth ? "text-emerald-500" : "text-red-500"}>OAUTH_CORE: {sysStatus?.oauth ? "OK" : "MISSING"}</span>
            </div>
            <div className="flex bg-slate-800 p-1 rounded-xl">
                <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>控制台</button>
                <button onClick={() => setActiveTab('logs')} className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>系統日誌</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' ? (
          <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end bg-slate-900/40 p-10 rounded-[2.5rem] border border-slate-800/50 backdrop-blur-sm shadow-2xl">
              <div>
                <h2 className="text-4xl font-black text-white tracking-tight">頻道自動化工坊</h2>
                <p className="text-slate-500 text-sm mt-2 font-medium italic opacity-60">System Version: v2.0.8-Stable</p>
              </div>
              <button onClick={() => setIsAdding(true)} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black shadow-xl shadow-indigo-900/30 transition-all active:scale-95">+ 新增配置</button>
            </div>

            {isAdding && (
              <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] p-12 animate-slide-down shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                <h3 className="text-2xl font-black mb-10 text-white">建立頻道實體</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">頻道名稱</label>
                    <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="例如：科技愛好者" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">主軸 (Niche)</label>
                    <input value={newNiche} onChange={e => setNewNiche(e.target.value)} placeholder="例如：廚藝教學" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-indigo-500 text-white font-bold italic" />
                  </div>
                </div>
                <div className="flex justify-end gap-6 pt-10">
                  <button onClick={() => setIsAdding(false)} className="px-8 py-3 text-slate-500 font-bold hover:text-slate-300">取消</button>
                  <button onClick={createChannel} className="px-14 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black shadow-lg shadow-indigo-900/20">儲存配置</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 hover:border-slate-600 transition-all shadow-xl group">
                  <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-5 mb-4">
                        <h3 className="text-3xl font-black text-white">{channel.name}</h3>
                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase ${
                          channel.status === 'running' ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-800 text-slate-500'
                        }`}>{channel.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-6 text-slate-400 text-sm font-bold">
                        <span className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl">地區: {channel.regionCode}</span>
                        <span className="text-indigo-400">主軸: {channel.channelState.niche}</span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      {!channel.auth ? (
                         <button onClick={() => startAuth(channel.id)} className="px-8 py-5 bg-amber-600 hover:bg-amber-500 text-white rounded-[1.2rem] font-black text-sm transition-all">連動 YouTube</button>
                      ) : (
                        <button 
                          onClick={() => runAutomation(channel)} 
                          disabled={channel.status === 'running'}
                          className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-[1.2rem] font-black text-sm transition-all"
                        >
                          啟動全自動流程
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl animate-fade-in">
             <div className="p-10 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-2xl font-black text-white uppercase tracking-wider">系統日誌核心</h3>
              <button onClick={() => setLogs([])} className="text-xs font-black text-red-500 border border-red-500/20 px-4 py-2 rounded hover:bg-red-500 hover:text-white transition-all">清除</button>
             </div>
             <div className="h-[700px] overflow-y-auto p-10 font-mono text-[11px] space-y-3 bg-slate-950/80">
              {logs.map(log => (
                <div key={log.id} className="flex gap-4 p-3 rounded-xl hover:bg-slate-900 transition-all">
                  <span className="text-slate-600">[{log.timestamp}]</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black ${log.level === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{log.phase || 'LOG'}</span>
                  <span className="text-indigo-400 font-bold">@{log.channelName}</span>
                  <span className={log.level === 'error' ? 'text-red-400' : 'text-slate-400'}>{log.message}</span>
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

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-12">
          <div className="max-w-2xl w-full bg-slate-900 border border-red-900/40 rounded-[4rem] p-20 text-center shadow-2xl">
            <h1 className="text-4xl font-black text-white mb-8 italic">FATAL_CORE_ERROR</h1>
            <div className="bg-black/50 p-10 rounded-3xl mb-12 text-left font-mono text-sm text-red-400 overflow-auto border border-red-900/30">
              {this.state.error?.message}
            </div>
            <button onClick={() => window.location.reload()} className="px-14 py-6 bg-red-600 text-white rounded-[2rem] font-black text-2xl transition-all">重啟核心</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
