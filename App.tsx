
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

// App component: Manages YouTube Shorts channels and automation workflows
const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGAS, setShowGAS] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>('cloud');
  
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
        addLog(`❌ 雲端錯誤: ${data.error}`);
        setStorageMode('local');
        const localData = localStorage.getItem('onyx_local_channels');
        if (localData) setChannels(JSON.parse(localData));
      }
    } catch (e: any) {
      setStorageMode('local');
      const localData = localStorage.getItem('onyx_local_channels');
      if (localData) setChannels(JSON.parse(localData));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFromDB();
  }, []);

  const saveToDB = async (updatedChannels: ChannelConfig[]) => {
    setChannels([...updatedChannels]);
    localStorage.setItem('onyx_local_channels', JSON.stringify(updatedChannels));
    if (storageMode === 'local') return;
    try {
      const res = await fetch(getApiUrl('/api/db?action=sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: updatedChannels })
      });
      const data = await res.json();
      if (data.success) addLog("☁️ 雲端同步成功");
      else addLog(`❌ 同步失敗: ${data.error}`);
    } catch (e) { addLog(`❌ 網路錯誤`); }
  };

  const toggleDay = (day: number) => {
    const days = [...newChan.schedule.activeDays];
    const index = days.indexOf(day);
    if (index > -1) days.splice(index, 1);
    else days.push(day);
    setNewChan({ ...newChan, schedule: { ...newChan.schedule, activeDays: days.sort() } });
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
        name: newChan.name,
        niche: newChan.niche,
        language: newChan.language,
        schedule: { ...newChan.schedule },
        history: [], auth: null, step: 0, lastLog: '待命'
      };
      next = [...channels, channel];
    }
    await saveToDB(next);
    setIsModalOpen(false);
    setEditingId(null);
    setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { ...defaultSchedule } });
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
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { ...defaultSchedule } }); }} className="px-8 py-2.5 bg-white text-black rounded-lg font-black shadow-lg">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-10">
            {isLoading && <div className="text-center py-20 animate-pulse text-zinc-500 font-black uppercase tracking-[0.3em]">Loading Core...</div>}
            
            {channels.map(c => (
              <div key={c.id} className="onyx-card rounded-[3.5rem] p-12 transition-all relative group border-zinc-700 border hover:border-zinc-500">
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
                     <button onClick={() => handleEdit(c)} className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-400 hover:text-white transition-all">編輯</button>
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

      {/* Modals */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-[2rem] p-10 space-y-8">
            <h3 className="text-2xl font-black italic uppercase">{editingId ? '編輯頻道' : '新增頻道'}</h3>
            <div className="space-y-4">
              <input 
                type="text" placeholder="頻道名稱" 
                className="w-full bg-black border border-zinc-800 p-4 rounded-xl outline-none focus:border-white transition-all"
                value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})}
              />
              <input 
                type="text" placeholder="利基市場 (Niche)" 
                className="w-full bg-black border border-zinc-800 p-4 rounded-xl outline-none focus:border-white transition-all"
                value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})}
              />
              <select 
                className="w-full bg-black border border-zinc-800 p-4 rounded-xl outline-none"
                value={newChan.language} onChange={e => setNewChan({...newChan, language: e.target.value as any})}
              >
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-4 bg-zinc-800 rounded-xl font-bold">取消</button>
              <button onClick={saveChannel} className="flex-1 p-4 bg-white text-black rounded-xl font-bold">儲存</button>
            </div>
          </div>
        </div>
      )}

      {showGAS && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-[2rem] p-10 space-y-6">
            <h3 className="text-2xl font-black italic uppercase">GAS 部署腳本</h3>
            <pre className="bg-black p-6 rounded-xl text-xs font-mono text-cyan-400 overflow-x-auto">
              {generateGASScript()}
            </pre>
            <button onClick={() => setShowGAS(false)} className="w-full p-4 bg-white text-black rounded-xl font-bold">關閉</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
