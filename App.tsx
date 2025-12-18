import React, { useState, useEffect, Suspense } from 'react';
import { 
  ChannelConfig, LogEntry, ChannelState, ScheduleConfig, PipelineResult, AuthCredentials 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-400 p-8 text-center">
          <div>
            <h1 className="text-3xl font-bold mb-4">系統發生錯誤 ⚠️</h1>
            <p className="bg-slate-800 p-4 rounded text-left font-mono text-sm max-w-2xl overflow-auto">
              {this.state.error?.message || "Unknown Error"}
            </p>
            <button 
                onClick={() => window.location.reload()}
                className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500"
            >
                重新整理
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  // --- State ---
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  // New Channel Form State
  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech");
  const [newRegion, setNewRegion] = useState("US");

  // --- Persistence & Init ---
  useEffect(() => {
    try {
        const saved = localStorage.getItem('sas_channels');
        if (saved) setChannels(JSON.parse(saved));

        // Handle OAuth Callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const pendingId = localStorage.getItem('sas_pending_auth_id');

        if (code && pendingId) {
            handleAuthCallback(code, pendingId);
        }
    } catch (e) {
        console.error("Init Error:", e);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
        localStorage.setItem('sas_channels', JSON.stringify(channels));
    }
  }, [channels, isLoading]);

  // --- Actions ---

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string) => {
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName,
      level,
      message: msg
    };
    setLogs(prev => [entry, ...prev]);
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    
    addLog(channelId, 'System', 'info', 'Exchanging OAuth Code...');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'System', 'success', 'YouTube 授權成功！');
      }
    } catch (e) {
      addLog(channelId, 'System', 'error', '授權失敗');
    }
  };

  const createChannel = () => {
    const newId = Date.now().toString();
    const newChannel: ChannelConfig = {
      id: newId,
      name: newChannelName || "New Channel",
      regionCode: newRegion,
      searchKeywords: newKeywords.split(',').map(s => s.trim()),
      channelState: { ...MOCK_CHANNEL_STATE, niche: newKeywords },
      schedule: { active: false, privacy_status: 'private' },
      auth: null,
      status: 'idle'
    };
    setChannels(prev => [...prev, newChannel]);
    setIsAdding(false);
    setNewChannelName("");
  };

  const deleteChannel = (id: string) => {
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const startAuth = async (channelId: string) => {
    localStorage.setItem('sas_pending_auth_id', channelId);
    try {
        const res = await fetch('/api/auth?action=url');
        const data = await res.json();
        if (data.url) window.location.href = data.url;
        else alert("無法獲取授權 URL，請檢查 Server Config (Client ID)");
    } catch (e) {
        alert("API 請求失敗，請確認後端是否運行。");
    }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) {
      alert("請先連結 YouTube 帳號");
      return;
    }

    updateChannel(channel.id, { status: 'running' });
    addLog(channel.id, channel.name, 'info', '🚀 開始自動化流程...');

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ channelConfig: channel })
      });
      const result: PipelineResult = await res.json();

      if (result.success) {
        addLog(channel.id, channel.name, 'success', '✅ 流程完成！影片已上傳。');
        if (result.uploadId) {
             addLog(channel.id, channel.name, 'success', `Video ID: ${result.uploadId}`);
        }
        updateChannel(channel.id, { status: 'success', lastRun: new Date().toLocaleString() });
      } else {
        addLog(channel.id, channel.name, 'error', `❌ 失敗: ${result.logs?.pop() || result.error || 'Unknown error'}`);
        updateChannel(channel.id, { status: 'error' });
      }
    } catch (e: any) {
      addLog(channel.id, channel.name, 'error', `API Error: ${e.message}`);
      updateChannel(channel.id, { status: 'error' });
    }
  };

  if (isLoading) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p>System Initializing...</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-gradient-to-tr from-red-600 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg">S</div>
             <div>
                <h1 className="font-bold text-xl tracking-tight">Shorts Automation 2.0</h1>
                <p className="text-xs text-slate-400">Multi-Channel Manager & Veo Integrated</p>
             </div>
          </div>
          <div className="flex gap-4">
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
                儀表板
            </button>
            <button 
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
                系統日誌
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        
        {activeTab === 'dashboard' && (
            <>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">頻道管理 ({channels.length})</h2>
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium shadow-lg shadow-emerald-900/20 transition-all"
                    >
                        <span>+ 新增頻道</span>
                    </button>
                </div>

                {/* Add Channel Modal (Inline) */}
                {isAdding && (
                    <div className="mb-8 p-6 bg-slate-900 border border-slate-700 rounded-xl animate-fade-in">
                        <h3 className="text-lg font-bold mb-4">設定新頻道</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">頻道名稱 (識別用)</label>
                                <input 
                                    value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                                    placeholder="My Tech Shorts"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">關鍵字 (用逗號分隔)</label>
                                <input 
                                    value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                                    placeholder="AI, Gadgets"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">目標地區</label>
                                <select 
                                    value={newRegion} onChange={e => setNewRegion(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                                >
                                    <option value="US">United States (US)</option>
                                    <option value="TW">Taiwan (TW)</option>
                                    <option value="JP">Japan (JP)</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-400 hover:text-white">取消</button>
                            <button onClick={createChannel} className="px-6 py-2 bg-indigo-600 rounded hover:bg-indigo-500">確認新增</button>
                        </div>
                    </div>
                )}

                {/* Channel Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {channels.map(channel => (
                        <div key={channel.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative group hover:border-indigo-500/50 transition-colors">
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white">{channel.name}</h3>
                                    <div className="flex gap-2 mt-1">
                                        <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700">{channel.regionCode}</span>
                                        {channel.searchKeywords.map(k => (
                                            <span key={k} className="px-2 py-0.5 rounded text-xs bg-indigo-900/30 text-indigo-300 border border-indigo-800/50">{k}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    channel.status === 'running' ? 'bg-blue-900/50 text-blue-300 animate-pulse' :
                                    channel.status === 'success' ? 'bg-green-900/50 text-green-300' :
                                    channel.status === 'error' ? 'bg-red-900/50 text-red-300' :
                                    'bg-slate-800 text-slate-500'
                                }`}>
                                    {channel.status.toUpperCase()}
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                                    <div className="text-xs text-slate-500 mb-1">YouTube 授權狀態</div>
                                    {channel.auth ? (
                                        <div className="text-green-400 font-medium flex items-center gap-1">
                                            <span>● 已連結</span>
                                            <button onClick={() => updateChannel(channel.id, {auth: null})} className="text-xs text-slate-500 underline ml-2">斷開</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => startAuth(channel.id)} className="text-red-400 hover:text-red-300 text-sm font-bold underline">
                                            未連結 (點擊授權)
                                        </button>
                                    )}
                                </div>
                                <div className="p-3 bg-slate-950 rounded border border-slate-800">
                                    <div className="text-xs text-slate-500 mb-1">排程設定</div>
                                    <div className="flex items-center justify-between">
                                        <span className={channel.schedule.active ? 'text-white' : 'text-slate-500'}>
                                            {channel.schedule.active ? '每天 09:00' : '已停用'}
                                        </span>
                                        <button 
                                            onClick={() => updateChannel(channel.id, { schedule: { ...channel.schedule, active: !channel.schedule.active }})}
                                            className={`w-8 h-4 rounded-full p-0.5 transition-colors ${channel.schedule.active ? 'bg-green-600' : 'bg-slate-700'}`}
                                        >
                                            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${channel.schedule.active ? 'translate-x-4' : ''}`}></div>
                                        </button>
                                    </div>
                                </div>
                             </div>

                             <div className="flex gap-3">
                                <button 
                                    onClick={() => runAutomation(channel)}
                                    disabled={!channel.auth || channel.status === 'running'}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 disabled:grayscale text-white rounded-lg font-bold shadow-lg shadow-indigo-900/20"
                                >
                                    {channel.status === 'running' ? '執行中...' : '🚀 立即執行全自動流程'}
                                </button>
                                <button 
                                    onClick={() => deleteChannel(channel.id)}
                                    className="px-3 py-3 bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                    title="刪除頻道"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                             </div>

                             {channel.lastRun && (
                                <div className="mt-3 text-xs text-center text-slate-600">
                                    上次執行: {channel.lastRun}
                                </div>
                             )}
                        </div>
                    ))}

                    {channels.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                            尚未設定任何頻道。請點擊「新增頻道」開始。
                        </div>
                    )}
                </div>
            </>
        )}

        {activeTab === 'logs' && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-4 bg-slate-800/50 border-b border-slate-800 font-bold text-slate-300">
                    系統活動日誌
                </div>
                <div className="p-0">
                    {logs.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">暫無活動紀錄</div>
                    ) : (
                        <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
                            {logs.map(log => (
                                <div key={log.id} className="p-4 flex gap-4 hover:bg-slate-800/30 transition-colors">
                                    <div className="text-xs text-slate-500 font-mono min-w-[80px]">{log.timestamp}</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-indigo-300 text-sm">{log.channelName}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                log.level === 'success' ? 'bg-green-900/30 text-green-400' :
                                                log.level === 'error' ? 'bg-red-900/30 text-red-400' :
                                                'bg-blue-900/30 text-blue-400'
                                            }`}>{log.level}</span>
                                        </div>
                                        <p className={`text-sm ${log.level === 'error' ? 'text-red-200' : 'text-slate-300'}`}>
                                            {log.message}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

const App = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
};

export default App;