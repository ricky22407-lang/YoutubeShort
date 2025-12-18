
import React, { useState, useEffect } from 'react';
import { 
  ChannelConfig, LogEntry, PipelineResult 
} from './types';
import { MOCK_CHANNEL_STATE } from './constants';

// Proper global augmentation
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  // Using var inside declare global to define a global variable that is also on window
  // This avoids modifier conflicts with existing Window interface declarations.
  var aistudio: AIStudio;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 p-8 text-center">
          <div className="max-w-xl">
            <h1 className="text-4xl font-black mb-4">SYSTEM CRITICAL ⚠️</h1>
            <p className="bg-red-950/20 border border-red-900 p-6 rounded-xl text-left font-mono text-sm overflow-auto">
              {this.state.error?.message || "Internal System Error"}
            </p>
            <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-red-600 text-white rounded-full font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-900/40">
              RESTART SYSTEM
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  const [newChannelName, setNewChannelName] = useState("");
  const [newKeywords, setNewKeywords] = useState("AI, Tech");
  const [newRegion, setNewRegion] = useState("US");

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
      
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('sas_pending_auth_id');
      if (code && pendingId) handleAuthCallback(code, pendingId);
      
      setIsLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isLoading) localStorage.setItem('sas_channels', JSON.stringify(channels));
  }, [channels, isLoading]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const addLog = (channelId: string, channelName: string, level: 'info' | 'success' | 'error', msg: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      channelId,
      channelName,
      level,
      message: msg
    }, ...prev].slice(0, 100));
  };

  const handleAuthCallback = async (code: string, channelId: string) => {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem('sas_pending_auth_id');
    addLog(channelId, 'System', 'info', 'Finalizing OAuth Handshake...');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.tokens) {
        updateChannel(channelId, { auth: data.tokens });
        addLog(channelId, 'System', 'success', 'YouTube Auth Successful!');
      }
    } catch (e) { addLog(channelId, 'System', 'error', 'Auth Failed'); }
  };

  const createChannel = () => {
    const newChannel: ChannelConfig = {
      id: Date.now().toString(),
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

  const updateChannel = (id: string, updates: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const startAuth = async (channelId: string) => {
    localStorage.setItem('sas_pending_auth_id', channelId);
    try {
        const res = await fetch('/api/auth?action=url');
        const data = await res.json();
        if (data.url) window.location.href = data.url;
    } catch (e) { alert("API Connection Failed"); }
  };

  const runAutomation = async (channel: ChannelConfig) => {
    if (!channel.auth) return alert("Authorize YouTube first");
    updateChannel(channel.id, { status: 'running' });
    addLog(channel.id, channel.name, 'info', 'Initiating 7-Stage Pipeline...');
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ channelConfig: channel })
      });
      const result: PipelineResult = await res.json();
      if (!res.ok || !result.success) {
        if (result.error?.includes("Requested entity was not found")) setHasApiKey(false);
        throw new Error(result.error || "Pipeline Failed");
      }
      addLog(channel.id, channel.name, 'success', `Video Generated & Uploaded: ${result.uploadId}`);
      updateChannel(channel.id, { status: 'success', lastRun: new Date().toLocaleString() });
    } catch (e: any) {
      addLog(channel.id, channel.name, 'error', e.message);
      updateChannel(channel.id, { status: 'error' });
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>LOADING_CORE...</div>;

  if (!hasApiKey) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl text-center backdrop-blur-xl">
        <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-bounce">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
        </div>
        <h2 className="text-3xl font-black text-white mb-4 tracking-tight">API BILLING REQUIRED</h2>
        <p className="text-slate-400 mb-10 leading-relaxed text-lg">
          Veo video generation requires a paid GCP project. Please select a valid API Key to continue the automation process.
        </p>
        <div className="space-y-4">
          <button onClick={handleSelectKey} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-900/40 hover:scale-[1.02]">
            SELECT API KEY
          </button>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="block text-sm text-slate-500 hover:text-indigo-400 transition-colors">
            View Billing Documentation →
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="bg-slate-900/50 border-b border-slate-800/60 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl shadow-indigo-500/20">S</div>
             <div>
                <h1 className="font-black text-2xl tracking-tighter uppercase">Shorts Auto</h1>
                <p className="text-[10px] text-slate-500 font-mono tracking-widest">BUILD_V2.0.6_VEO_ENABLED</p>
             </div>
          </div>
          <nav className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800/50">
            <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>DASHBOARD</button>
            <button onClick={() => setActiveTab('logs')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}>SYS_LOGS</button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-4xl font-black text-white tracking-tighter">CHANNELS</h2>
                <p className="text-slate-500 text-sm">Orchestrating {channels.length} automated identities</p>
              </div>
              <button onClick={() => setIsAdding(true)} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-sm shadow-xl shadow-emerald-900/30 transition-all hover:-translate-y-1">
                + NEW CHANNEL
              </button>
            </div>

            {isAdding && (
              <div className="mb-10 p-8 bg-slate-900/80 border border-slate-800 rounded-3xl animate-slide-down backdrop-blur-sm">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><span className="w-2 h-2 bg-indigo-500 rounded-full"></span> Channel Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Identity Name</label>
                    <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 focus:border-indigo-500 outline-none transition-all" placeholder="Tech Explorer" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Core Keywords</label>
                    <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 focus:border-indigo-500 outline-none transition-all" placeholder="AI, Robotics, Future" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Target Region</label>
                    <select value={newRegion} onChange={e => setNewRegion(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 focus:border-indigo-500 outline-none transition-all appearance-none">
                      <option value="US">🇺🇸 United States</option>
                      <option value="TW">🇹🇼 Taiwan</option>
                      <option value="JP">🇯🇵 Japan</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-4">
                  <button onClick={() => setIsAdding(false)} className="px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors">CANCEL</button>
                  <button onClick={createChannel} className="px-10 py-3 bg-indigo-600 rounded-2xl font-black hover:bg-indigo-500 transition-all">INITIALIZE</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {channels.map(channel => (
                <div key={channel.id} className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 group hover:border-indigo-500/40 transition-all hover:shadow-2xl hover:shadow-indigo-500/5">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-black text-white group-hover:text-indigo-400 transition-colors">{channel.name}</h3>
                      <div className="flex gap-2 mt-2">
                        <span className="px-3 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-400 uppercase tracking-widest">{channel.regionCode}</span>
                        {channel.searchKeywords.slice(0, 3).map(k => (
                          <span key={k} className="px-3 py-1 rounded-lg text-[10px] font-bold bg-indigo-950/40 text-indigo-400 border border-indigo-800/30 uppercase tracking-widest">{k}</span>
                        ))}
                      </div>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest ${
                      channel.status === 'running' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' :
                      channel.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                      channel.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {channel.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/40">
                      <p className="text-[10px] font-bold text-slate-600 mb-2 uppercase tracking-widest">YouTube Pipeline</p>
                      {channel.auth ? (
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400 text-xs font-bold flex items-center gap-2"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span> AUTH_ACTIVE</span>
                          <button onClick={() => updateChannel(channel.id, {auth: null})} className="text-[10px] text-slate-600 underline hover:text-red-400">DISCONNECT</button>
                        </div>
                      ) : (
                        <button onClick={() => startAuth(channel.id)} className="text-indigo-400 hover:text-indigo-300 text-xs font-black uppercase tracking-widest transition-colors">LINK_ACCOUNT</button>
                      )}
                    </div>
                    <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/40">
                      <p className="text-[10px] font-bold text-slate-600 mb-2 uppercase tracking-widest">Automation Engine</p>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${channel.schedule.active ? 'text-white' : 'text-slate-600'}`}>{channel.schedule.active ? 'CRON: DAILY_0900' : 'MANUAL_MODE'}</span>
                        <button onClick={() => updateChannel(channel.id, { schedule: { ...channel.schedule, active: !channel.schedule.active }})} className={`w-10 h-5 rounded-full p-1 transition-colors ${channel.schedule.active ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full transition-transform ${channel.schedule.active ? 'translate-x-5' : ''}`}></div>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button onClick={() => runAutomation(channel)} disabled={!channel.auth || channel.status === 'running'} className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-30 disabled:grayscale text-white rounded-2xl font-black shadow-xl shadow-indigo-900/20 transition-all active:scale-95">
                      {channel.status === 'running' ? 'EXECUTING PIPELINE...' : 'EXECUTE FULL AUTOMATION'}
                    </button>
                    <button onClick={() => { if(confirm('Delete channel?')) setChannels(prev => prev.filter(c => c.id !== channel.id)) }} className="px-5 py-4 bg-slate-800 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded-2xl transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                </div>
              ))}
              {channels.length === 0 && <div className="col-span-full py-20 text-center text-slate-600 border-2 border-dashed border-slate-800 rounded-3xl font-mono uppercase tracking-[0.2em]">NO_CHANNELS_DETECTED</div>}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-6 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-black text-slate-300 uppercase tracking-widest flex items-center gap-2"><span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span> SYSTEM_KERNEL_LOGS</h3>
              <button onClick={() => setLogs([])} className="text-[10px] font-bold text-slate-500 hover:text-red-400 uppercase tracking-widest">CLEAR_BUFFER</button>
            </div>
            <div className="p-2 font-mono text-sm h-[600px] overflow-y-auto bg-slate-950/80">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-700">BUFFER_EMPTY_WAITING_FOR_INPUT...</div>
              ) : (
                <div className="space-y-1">
                  {logs.map(log => (
                    <div key={log.id} className="group p-2 flex gap-4 hover:bg-slate-800/40 rounded transition-colors border-l-2 border-transparent hover:border-indigo-500">
                      <div className="text-[10px] text-slate-600 font-mono min-w-[80px] mt-1">[{log.timestamp}]</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-bold text-indigo-500 text-xs">@{log.channelName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                            log.level === 'success' ? 'bg-emerald-900/40 text-emerald-400' :
                            log.level === 'error' ? 'bg-red-900/40 text-red-400' : 'bg-blue-900/40 text-blue-400'
                          }`}>{log.level}</span>
                        </div>
                        <p className={`text-xs leading-relaxed ${log.level === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
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

const App = () => (<ErrorBoundary><AppContent /></ErrorBoundary>);
export default App;
