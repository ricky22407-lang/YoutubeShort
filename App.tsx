
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGAS, setShowGAS] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  const pollInterval = useRef<number | null>(null);
  
  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } as ScheduleConfig
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const getApiUrl = (endpoint: string) => {
    const base = window.location.origin;
    return `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  };

  // 混合讀取邏輯
  const fetchFromDB = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/db?action=list'));
      
      // 核心修復：如果 API 不存在 (404)，切換到本地模式
      if (res.status === 404) {
        if (storageMode !== 'local') {
          setStorageMode('local');
          addLog("⚠️ 偵測到後端 API 未部署，切換至本地儲存模式。");
        }
        const localData = localStorage.getItem('onyx_local_channels');
        setChannels(localData ? JSON.parse(localData) : []);
        setIsLoading(false);
        return;
      }

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

      const rawText = await res.text();
      const data = JSON.parse(rawText);
      
      if (data.success) {
        setChannels(data.channels || []);
        setStorageMode('cloud');
        const hasRunning = (data.channels || []).some((c: any) => c.status === 'running');
        if (hasRunning) {
          if (!pollInterval.current) startPolling();
        } else {
          stopPolling();
        }
      } else {
        addLog(`❌ 雲端錯誤: ${data.error}`);
      }
    } catch (e: any) {
      console.error("Fetch DB failed, falling back to local", e.message);
      setStorageMode('local');
      const localData = localStorage.getItem('onyx_local_channels');
      setChannels(localData ? JSON.parse(localData) : []);
    }
    if (!silent) setIsLoading(false);
  };

  const startPolling = () => {
    if (pollInterval.current) return;
    pollInterval.current = window.setInterval(() => fetchFromDB(true), 4000);
  };

  const stopPolling = () => {
    if (pollInterval.current) { clearInterval(pollInterval.current); pollInterval.current = null; }
  };

  useEffect(() => {
    fetchFromDB();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_v8_pending');
    if (code && pendingId) handleTokenExchange(code, pendingId);
    return () => stopPolling();
  }, []);

  // 混合儲存邏輯
  const saveToDB = async (updatedChannels: ChannelConfig[]) => {
    setChannels([...updatedChannels]);
    
    // 無論如何都存一份到 Local，作為保險
    localStorage.setItem('onyx_local_channels', JSON.stringify(updatedChannels));

    if (storageMode === 'local') {
      addLog("💾 已儲存至瀏覽器本地 (Offline Mode)");
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/db?action=sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: updatedChannels })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) addLog("☁️ 雲端同步成功");
      }
    } catch (e) { 
      addLog(`❌ 雲端同步失敗，已保留本地副本`);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!window.confirm("確定要移除此頻道嗎？")) return;
    const next = channels.filter(c => c.id !== id);
    await saveToDB(next);
  };

  const handleManualTrigger = async (channel: ChannelConfig) => {
    if (channel.status === 'running') return;
    if (storageMode === 'local') {
      alert("本地模式僅支援資料管理。如需執行自動化流水線，請確保部署 api/ 路由並設定 Firebase。");
      return;
    }
    if (!channel.auth) return alert("請先完成 YouTube 授權");
    
    addLog(`🚀 啟動引擎: ${channel.name}`);
    const optimistic = channels.map(c => c.id === channel.id ? { ...c, status: 'running' as 'running', step: 5, lastLog: '正在分析...' } : c);
    await saveToDB(optimistic);
    startPolling();

    try {
      const res = await fetch(getApiUrl('/api/pipeline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'full_flow', channel })
      });
      if (!res.ok) throw new Error("Pipeline API 404");
    } catch (e: any) { 
      addLog(`❌ 執行失敗: ${e.message}`); 
      await fetchFromDB(true);
    }
  };

  const handleTokenExchange = async (code: string, id: string) => {
    window.history.replaceState({}, document.title, "/");
    localStorage.removeItem('pilot_v8_pending');
    if (storageMode === 'local') return addLog("❌ 本地模式不支援 OAuth 交換。");

    addLog("正在交換授權金鑰...");
    try {
      const res = await fetch(getApiUrl('/api/auth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        const next = channels.map(c => c.id === id ? { ...c, auth: data.tokens } : c);
        await saveToDB(next);
        addLog("✅ 授權連結成功");
      }
    } catch (e) { addLog(`❌ 授權失敗`); }
  };

  const startAuth = async (channel: ChannelConfig) => {
    if (storageMode === 'local') return alert("本地模式無法存取 OAuth 伺服器。");
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch(getApiUrl('/api/auth?action=url'));
    const data = await res.json();
    window.location.href = data.url;
  };

  const openEdit = (channel: ChannelConfig) => {
    setEditingId(channel.id);
    setNewChan({
      name: channel.name,
      niche: channel.niche,
      language: channel.language || 'zh-TW',
      schedule: channel.schedule || { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true }
    });
    setIsModalOpen(true);
  };

  const saveChannel = async () => {
    if (!newChan.name) return;
    let next: ChannelConfig[];
    if (editingId) {
      next = channels.map(c => c.id === editingId ? { ...c, ...newChan } : c);
    } else {
      const channel: ChannelConfig = {
        id: Math.random().toString(36).substring(2, 9),
        status: 'idle',
        name: newChan.name,
        niche: newChan.niche,
        language: newChan.language,
        schedule: { ...newChan.schedule, autoEnabled: true },
        history: [],
        auth: null,
        step: 0,
        lastLog: '待命'
      };
      next = [...channels, channel];
    }
    await saveToDB(next);
    setIsModalOpen(false);
    setEditingId(null);
  };

  const generateGASScript = () => {
    const baseUrl = window.location.origin;
    const firebaseId = (process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
    return `// ONYX Elite Automation Script\nfunction hourlyCheck() {\n  const API_ENDPOINT = "${baseUrl}/api/pipeline";\n  const DB_URL = "https://${firebaseId}.firebaseio.com/channels.json";\n  // ... (腳本剩餘部分)\n}`.trim();
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col text-zinc-100">
      {/* Header */}
      <nav className="p-6 border-b border-zinc-800 bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black text-black text-xl italic shadow-[0_0_20px_rgba(255,255,255,0.2)]">S</div>
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">ShortsPilot <span className="text-cyan-400">ONYX</span></h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-bold text-zinc-400 tracking-[0.4em] uppercase">Core v8.3 Elite</span>
              <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${storageMode === 'cloud' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                {storageMode === 'cloud' ? 'Cloud Connected' : 'Local Mode'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowGAS(true)} className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 rounded-lg font-bold transition-all border border-zinc-700 flex items-center gap-2">GAS 部署</button>
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); }} className="px-8 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-lg font-black transition-all shadow-lg">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-10">
            {isLoading && (
              <div className="text-center py-24 flex flex-col items-center gap-6">
                <div className="w-10 h-10 border-[3px] border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-black text-zinc-400 tracking-[0.3em] uppercase">正在讀取系統資料庫</p>
              </div>
            )}
            
            {!isLoading && channels.length === 0 && (
              <div className="text-center py-32 border-2 border-dashed border-zinc-800 rounded-[3.5rem] bg-zinc-900/10">
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">目前沒有任何頻道</p>
                <button onClick={() => setIsModalOpen(true)} className="mt-6 text-cyan-400 font-black hover:text-white transition-colors underline underline-offset-8">立即建立第一個核心</button>
              </div>
            )}

            {channels.map(c => (
              <div key={c.id} className={`onyx-card rounded-[3.5rem] p-12 transition-all relative overflow-hidden group border-zinc-700 hover:border-zinc-500 ${c.status === 'running' ? 'border-cyan-500/50 shadow-[0_0_50px_rgba(0,210,255,0.1)]' : ''}`}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 relative z-10">
                  <div className="flex-1 space-y-8">
                    <div className="flex items-center gap-6">
                      <h2 className="text-4xl font-black text-white tracking-tight italic uppercase">{c.name}</h2>
                      <span className="bg-zinc-800 text-zinc-100 text-[10px] px-4 py-2 rounded-xl font-black uppercase tracking-widest border border-zinc-700">{c.niche}</span>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex bg-black/50 p-2.5 rounded-2xl border border-zinc-800">
                        {['日','一','二','三','四','五','六'].map((d, i) => (
                          <div key={i} className={`w-11 h-11 flex items-center justify-center rounded-xl font-black text-xs ${c.schedule?.activeDays.includes(i) ? 'bg-zinc-100 text-black shadow-lg scale-110' : 'text-zinc-700 opacity-40'}`}>{d}</div>
                        ))}
                      </div>
                      <div className="bg-zinc-900/80 p-4 px-8 rounded-2xl border border-zinc-700 flex flex-col items-center">
                        <span className="text-zinc-500 text-[8px] font-black uppercase tracking-widest mb-1">Time</span>
                        <span className="text-zinc-100 font-mono font-black text-base">{c.schedule?.time}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-end mb-2">
                        <p className="text-[11px] font-black text-zinc-200 uppercase tracking-[0.2em] italic flex items-center gap-2">
                           <span className={`w-2 h-2 rounded-full ${c.status === 'running' ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'}`}></span>
                           {c.lastLog || 'System Idle'}
                        </p>
                        <span className="text-base font-black text-cyan-400 font-mono tracking-tighter">{c.step || 0}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 shadow-inner">
                        <div className={`h-full bg-cyan-400 transition-all duration-1000 ease-out`} style={{ width: `${c.step || 0}%`, boxShadow: '0 0 20px rgba(0,210,255,0.6)' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-4 relative z-20">
                    <div className="flex gap-3">
                       <button onClick={() => openEdit(c)} className="p-6 bg-zinc-900 text-zinc-300 hover:text-white rounded-[2rem] border border-zinc-700 transition-all shadow-lg"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                       <button onClick={() => deleteChannel(c.id)} className="p-6 bg-red-950/20 text-red-500 hover:bg-red-500 hover:text-white rounded-[2rem] border border-red-900/30 transition-all shadow-lg"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className={`px-8 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl ${storageMode === 'local' ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-white text-black hover:bg-zinc-200'}`}>連結 YouTube</button>
                    ) : (
                      <button onClick={() => handleManualTrigger(c)} disabled={c.status === 'running'} className={`px-10 py-6 rounded-[2rem] font-black transition-all border text-sm uppercase tracking-[0.2em] shadow-2xl ${c.status === 'running' ? 'bg-zinc-900 text-zinc-500 border-zinc-800' : 'bg-cyan-500 hover:bg-cyan-400 text-black border-cyan-400/20'}`}>手動啟動</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-zinc-800 bg-[#080808] p-10 flex flex-col shadow-2xl">
          <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.5em] mb-10 flex items-center gap-4">
             <div className={`w-2.5 h-2.5 rounded-full ${storageMode === 'cloud' ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}></div>
             System Monitor
          </h4>
          <div className="space-y-4 font-mono text-[10px] flex-1 overflow-y-auto pr-4 custom-scrollbar">
            {globalLog.map((log, i) => (
              <div key={i} className="p-5 rounded-2xl border bg-zinc-900/30 text-zinc-400 border-zinc-800"> {log} </div>
            ))}
            {globalLog.length === 0 && <p className="text-zinc-700 italic text-center py-20 uppercase tracking-widest">No Active Logs</p>}
          </div>
        </aside>
      </div>

      {/* Settings Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-2xl rounded-[4rem] p-16 shadow-2xl">
             <h2 className="text-3xl font-black text-white italic uppercase mb-12 tracking-tighter">{editingId ? '編輯頻道設定' : '建立核心頻道'}</h2>
             <div className="space-y-12">
                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em]">名稱</label>
                    <input className="w-full rounded-2xl p-7 text-zinc-100 font-bold bg-black border border-zinc-800" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em]">領域</label>
                    <input className="w-full rounded-2xl p-7 text-zinc-100 font-bold bg-black border border-zinc-800" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                  </div>
                </div>
                <div className="flex gap-6 pt-10">
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 py-7 text-zinc-500 font-black uppercase tracking-[0.4em] text-[10px]">取消</button>
                  <button onClick={saveChannel} className="flex-1 py-7 bg-white text-black rounded-[2.5rem] font-black uppercase tracking-[0.3em] text-[10px]">儲存變更</button>
                </div>
             </div>
          </div>
        </div>
      )}

      <style>{`
        .onyx-card { background: linear-gradient(145deg, #101010, #080808); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
