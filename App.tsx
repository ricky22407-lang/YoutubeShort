
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGAS, setShowGAS] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  const defaultSchedule: ScheduleConfig = { 
    activeDays: [1, 2, 3, 4, 5], 
    time: '19:00', 
    countPerDay: 1, 
    autoEnabled: true 
  };

  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { ...defaultSchedule }
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const getApiUrl = (endpoint: string) => {
    const base = window.location.origin;
    return `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  };

  const fetchFromDB = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/db?action=list'));
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        setStorageMode('cloud');
      } else {
        setStorageMode('local');
        const localData = localStorage.getItem('onyx_local_channels');
        if (localData) setChannels(JSON.parse(localData));
      }
    } catch (e: any) {
      setStorageMode('local');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const activeTasks = channels.some(c => c.status === 'running');
    if (activeTasks) {
      if (!pollingRef.current) {
        addLog("🛰️ 啟動追蹤模式，偵測任務進度...");
        pollingRef.current = setInterval(() => fetchFromDB(true), 3000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        addLog("💤 任務追蹤結束。");
      }
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [channels]);

  useEffect(() => {
    fetchFromDB();
  }, []);

  const triggerPipeline = async (channel: ChannelConfig) => {
    if (channel.status === 'running') return;
    addLog(`🚀 啟動全自動流程: ${channel.name}...`);
    
    setChannels(prev => prev.map(c => 
      c.id === channel.id ? { ...c, status: 'running', step: 5, lastLog: '正在連線伺服器...' } : c
    ));

    try {
      const res = await fetch(getApiUrl('/api/pipeline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'full_flow', channel })
      });
      
      const data = await res.json();
      if (!data.success) {
        addLog(`❌ 執行失敗: ${data.error}`);
        setChannels(prev => prev.map(c => 
          c.id === channel.id ? { ...c, status: 'error', lastLog: data.error } : c
        ));
      } else {
        addLog(`✅ ${channel.name} 任務已移交後端背景執行。`);
      }
    } catch (e: any) {
      addLog(`❌ 網路錯誤: ${e.message}`);
      setChannels(prev => prev.map(c => 
        c.id === channel.id ? { ...c, status: 'error', lastLog: '連線超時' } : c
      ));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要移除此頻道？')) return;
    const next = channels.filter(c => c.id !== id);
    setChannels(next);
    localStorage.setItem('onyx_local_channels', JSON.stringify(next));
    if (storageMode === 'cloud') {
      await fetch(getApiUrl('/api/db?action=sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: next })
      });
    }
    addLog("🗑️ 頻道已移除");
  };

  const handleEdit = (c: ChannelConfig) => {
    setEditingId(c.id);
    setNewChan({
      name: c.name || '',
      niche: c.niche || '',
      language: c.language || 'zh-TW',
      schedule: c.schedule ? { ...c.schedule } : { ...defaultSchedule }
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
        name: newChan.name, niche: newChan.niche, language: newChan.language,
        schedule: { ...newChan.schedule }, history: [], auth: null, step: 0, lastLog: '待命'
      };
      next = [...channels, channel];
    }
    
    setChannels([...next]);
    localStorage.setItem('onyx_local_channels', JSON.stringify(next));
    if (storageMode === 'cloud') {
      try {
        await fetch(getApiUrl('/api/db?action=sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channels: next })
        });
        addLog("☁️ 資料已同步至雲端");
      } catch (e) { addLog(`❌ 雲端同步失敗`); }
    }
    setIsModalOpen(false);
  };

  const generateGASScript = () => {
    return `const WEBHOOK_URL = "${window.location.origin}/api/cron";\nconst CRON_SECRET = "YOUR_SECRET";\nfunction checkAndRun() {\n  UrlFetchApp.fetch(WEBHOOK_URL, {method:"post",headers:{"Authorization":"Bearer "+CRON_SECRET}});\n}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col text-zinc-100">
      <nav className="p-6 border-b border-zinc-800 bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-black text-black text-lg italic shadow-lg">S</div>
          <div>
            <h1 className="text-xl font-black text-white italic tracking-tighter uppercase">ShortsPilot <span className="text-cyan-400">ONYX</span></h1>
            <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${storageMode === 'cloud' ? 'text-cyan-400 border-cyan-800 bg-cyan-950' : 'text-amber-400 border-amber-800 bg-amber-950'} border mt-1 block w-fit`}>
              {storageMode === 'cloud' ? 'Cloud Link' : 'Local Only'}
            </span>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowGAS(true)} className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-lg font-bold border border-zinc-800 text-xs">GAS 排程</button>
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { ...defaultSchedule } }); }} className="px-6 py-2 bg-white text-black rounded-lg font-black shadow-lg hover:scale-105 transition-all text-xs">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-8">
            {isLoading && <div className="text-center py-20 animate-pulse text-zinc-600 font-black uppercase text-xs tracking-[0.3em]">Grid Accessing...</div>}
            
            {channels.map(c => (
              <div key={c.id} className="onyx-card rounded-[2.5rem] p-10 relative group border-zinc-800 border hover:border-zinc-700 transition-all shadow-2xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center gap-4">
                      <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">{c.name}</h2>
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest ${c.status === 'running' ? 'bg-cyan-500 text-black animate-pulse' : c.status === 'error' ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                        {c.status === 'running' ? 'Active' : c.status === 'error' ? 'Alert' : 'Idle'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Niche: <span className="text-zinc-300">{c.niche}</span></p>
                  </div>

                  <div className="flex gap-3">
                     <button onClick={() => handleEdit(c)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 transition-all">✎</button>
                     <button onClick={() => handleDelete(c.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-900 text-red-900/50 hover:text-red-500 border border-zinc-800 transition-all">✕</button>
                     <button 
                      onClick={() => triggerPipeline(c)}
                      disabled={c.status === 'running'}
                      className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${c.status === 'running' ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-zinc-800' : 'bg-cyan-500 text-black hover:scale-105 shadow-xl'}`}
                     >
                       {c.status === 'running' ? 'Executing' : 'Deploy'}
                     </button>
                  </div>
                </div>

                {(c.status === 'running' || c.status === 'error' || (c.step || 0) > 0) && (
                  <div className="mt-8 pt-8 border-t border-zinc-800/50 space-y-4">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${c.status === 'error' ? 'text-red-500' : 'text-zinc-600'}`}>System Message</p>
                        <p className={`text-xs font-bold italic ${c.status === 'error' ? 'text-red-400' : 'text-cyan-400'}`}>{c.lastLog || '等待同步...'}</p>
                      </div>
                      <span className="text-2xl font-black font-mono text-white italic">{c.step || 0}%</span>
                    </div>
                    <div className="h-2.5 bg-black rounded-full overflow-hidden border border-zinc-800">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out ${c.status === 'error' ? 'bg-red-600' : 'bg-cyan-500'}`}
                        style={{ width: `${c.step || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {channels.length === 0 && !isLoading && (
              <div className="py-20 text-center border-2 border-dashed border-zinc-900 rounded-[3rem] text-zinc-700 font-bold uppercase text-xs">No Core Configured.</div>
            )}
          </div>
        </main>

        <aside className="w-96 border-l border-zinc-800 bg-[#080808] p-8 flex flex-col shadow-2xl">
          <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] mb-8 text-center">Intelligence Log</h4>
          <div className="space-y-3 font-mono text-[9px] flex-1 overflow-y-auto pr-2 scrollbar-thin">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-4 bg-[#0a0a0a] border border-zinc-900 rounded-2xl text-zinc-500 border-l-2 ${log.includes('❌') ? 'border-l-red-500 text-red-400' : log.includes('✅') ? 'border-l-emerald-500 text-emerald-400' : 'border-l-cyan-500/20'}`}>{log}</div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-[#0c0c0c] border border-zinc-800 w-full max-w-lg rounded-[3.5rem] p-12 space-y-8 shadow-2xl">
            <h3 className="text-2xl font-black italic uppercase text-white">{editingId ? 'Modify System' : 'Init System'}</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Channel Identifier</label>
                <input type="text" placeholder="YouTube 名稱" className="w-full bg-black border border-zinc-800 p-5 rounded-2xl outline-none focus:border-cyan-500 transition-all text-white font-bold text-sm" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Market Niche</label>
                <input type="text" placeholder="例如: 療癒貓咪, 3D 列印, 金融冷知識" className="w-full bg-black border border-zinc-800 p-5 rounded-2xl outline-none focus:border-cyan-500 transition-all text-white font-bold text-sm" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-5 text-zinc-600 font-black uppercase tracking-widest text-[10px] hover:text-white">Cancel</button>
              <button onClick={saveChannel} className="flex-1 p-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:scale-105 transition-all">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showGAS && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[110] flex items-center justify-center p-6">
          <div className="bg-[#0c0c0c] border border-zinc-800 w-full max-w-2xl rounded-[3rem] p-12 space-y-8 shadow-2xl">
            <h3 className="text-xl font-black italic uppercase text-white tracking-widest">Script Deployment</h3>
            <pre className="bg-black p-8 rounded-3xl text-[10px] font-mono text-cyan-500 border border-zinc-900 overflow-x-auto select-all leading-relaxed">{generateGASScript()}</pre>
            <button onClick={() => setShowGAS(false)} className="w-full p-6 bg-white text-black rounded-2xl font-black uppercase text-[10px]">Close Console</button>
          </div>
        </div>
      )}
      <style>{`
        .onyx-card { background: linear-gradient(165deg, #0d0d0d 0%, #050505 100%); }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
