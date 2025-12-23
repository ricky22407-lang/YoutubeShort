
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

  const fetchFromDB = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/db?action=list'));
      if (res.status === 404) {
        if (storageMode !== 'local') {
          setStorageMode('local');
          addLog("⚠️ API 404，切換至本地儲存");
        }
        const localData = localStorage.getItem('onyx_local_channels');
        setChannels(localData ? JSON.parse(localData) : []);
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        setStorageMode('cloud');
      } else {
        addLog(`❌ 雲端錯誤: ${data.error}`);
        setStorageMode('local');
      }
    } catch (e: any) {
      setStorageMode('local');
      const localData = localStorage.getItem('onyx_local_channels');
      setChannels(localData ? JSON.parse(localData) : []);
    }
    if (!silent) setIsLoading(false);
  };

  useEffect(() => {
    fetchFromDB();
  }, []);

  const saveToDB = async (updatedChannels: ChannelConfig[]) => {
    setChannels([...updatedChannels]);
    localStorage.setItem('onyx_local_channels', JSON.stringify(updatedChannels));
    if (storageMode === 'local') return;
    try {
      await fetch(getApiUrl('/api/db?action=sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: updatedChannels })
      });
      addLog("☁️ 雲端同步成功");
    } catch (e) { addLog(`❌ 同步失敗`); }
  };

  const toggleDay = (day: number) => {
    const days = [...newChan.schedule.activeDays];
    const index = days.indexOf(day);
    if (index > -1) days.splice(index, 1);
    else days.push(day);
    setNewChan({ ...newChan, schedule: { ...newChan.schedule, activeDays: days.sort() } });
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
        history: [], auth: null, step: 0, lastLog: '待命'
      };
      next = [...channels, channel];
    }
    await saveToDB(next);
    setIsModalOpen(false);
    setEditingId(null);
  };

  const generateGASScript = () => {
    const baseUrl = window.location.origin;
    return `// ONYX Elite Automation Script\nfunction onyxHeartbeat() {\n  const API = "${baseUrl}/api/pipeline";\n  // 此腳本應部署於 Google Apps Script 並設定每小時觸發器\n  console.log("Checking channels at " + API);\n}`.trim();
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col text-zinc-100">
      <nav className="p-6 border-b border-zinc-800 bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black text-black text-xl italic">S</div>
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter uppercase">ShortsPilot <span className="text-cyan-400">ONYX</span></h1>
            <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${storageMode === 'cloud' ? 'text-cyan-400 border-cyan-800 bg-cyan-950' : 'text-amber-400 border-amber-800 bg-amber-950'} border mt-2 block w-fit`}>
              {storageMode === 'cloud' ? 'Cloud Sync' : 'Local Offline'}
            </span>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowGAS(true)} className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 rounded-lg font-bold border border-zinc-700">GAS 部署</button>
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); }} className="px-8 py-2.5 bg-white text-black rounded-lg font-black shadow-lg">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-10">
            {isLoading && <div className="text-center py-20 animate-pulse text-zinc-500 font-black uppercase tracking-[0.3em]">Loading Core...</div>}
            
            {channels.map(c => (
              <div key={c.id} className={`onyx-card rounded-[3.5rem] p-12 transition-all relative group border-zinc-700 border hover:border-zinc-500`}>
                <div className="flex justify-between items-center">
                  <div className="space-y-6">
                    <h2 className="text-4xl font-black text-white italic uppercase">{c.name}</h2>
                    <div className="flex gap-4 items-center">
                       <div className="flex bg-black/50 p-2 rounded-xl border border-zinc-800">
                        {['日','一','二','三','四','五','六'].map((d, i) => (
                          <div key={i} className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black ${c.schedule?.activeDays.includes(i) ? 'bg-white text-black' : 'text-zinc-700 opacity-40'}`}>{d}</div>
                        ))}
                       </div>
                       <span className="font-mono text-cyan-400 font-black">{c.schedule?.time}</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                     <button onClick={() => { setEditingId(c.id); setNewChan({...c} as any); setIsModalOpen(true); }} className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-400 hover:text-white transition-all">編輯</button>
                     <button onClick={() => { if(confirm('刪除？')) saveToDB(channels.filter(x => x.id !== c.id)) }} className="p-4 bg-red-950/20 rounded-2xl border border-red-900/30 text-red-500 hover:bg-red-500 hover:text-white transition-all">刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="w-96 border-l border-zinc-800 bg-[#080808] p-10 flex flex-col shadow-2xl">
          <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.5em] mb-10">System Log</h4>
          <div className="space-y-3 font-mono text-[9px] flex-1 overflow-y-auto">
            {globalLog.map((log, i) => (
              <div key={i} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400">{log}</div>
            ))}
          </div>
        </aside>
      </div>

      {/* GAS Modal */}
      {showGAS && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 z-[110]">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-3xl rounded-[3rem] p-12 shadow-2xl">
             <h2 className="text-2xl font-black text-white italic mb-6 uppercase">Google Apps Script 部署指令</h2>
             <p className="text-zinc-400 text-sm mb-6 font-bold leading-relaxed">請將以下代碼複製到 Google Sheet 的「延伸模組 > Apps Script」中，並設定每小時執行一次的觸發器，即可達成全自動發片。</p>
             <pre className="bg-black p-8 rounded-3xl text-cyan-400 font-mono text-xs border border-zinc-800 overflow-x-auto select-all">{generateGASScript()}</pre>
             <button onClick={() => setShowGAS(false)} className="mt-8 w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs">我知道了</button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-2xl rounded-[4rem] p-16 shadow-2xl">
             <h2 className="text-3xl font-black text-white italic uppercase mb-12 tracking-tighter">{editingId ? '編輯頻道設定' : '建立核心頻道'}</h2>
             <div className="space-y-10">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">頻道名稱</label>
                    <input className="w-full rounded-2xl p-5 bg-black border border-zinc-800 text-white font-bold" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">發片時間</label>
                    <input type="time" className="w-full rounded-2xl p-5 bg-black border border-zinc-800 text-white font-bold" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: { ...newChan.schedule, time: e.target.value }})} />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">重複星期</label>
                  <div className="flex gap-2">
                    {['日','一','二','三','四','五','六'].map((d, i) => (
                      <button key={i} onClick={() => toggleDay(i)} className={`flex-1 py-4 rounded-xl font-black text-xs transition-all border ${newChan.schedule.activeDays.includes(i) ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-600 border-zinc-800'}`}>{d}</button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-6 pt-10">
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 text-zinc-500 font-black uppercase tracking-widest text-xs">取消</button>
                  <button onClick={saveChannel} className="flex-1 py-6 bg-white text-black rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl">儲存並同步</button>
                </div>
             </div>
          </div>
        </div>
      )}

      <style>{`.onyx-card { background: linear-gradient(145deg, #101010, #080808); }`}</style>
    </div>
  );
};

export default App;
