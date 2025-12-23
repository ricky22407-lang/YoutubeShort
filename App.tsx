
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newChan, setNewChan] = useState({ 
    name: '', 
    niche: 'AI 科技', 
    language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } as ScheduleConfig
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);

  // 從資料庫讀取頻道資訊 (Firebase 需透過 API)
  const fetchFromDB = async () => {
    setIsLoading(true);
    try {
      // 假設你有一個 API 端點獲取所有頻道 (後續在 api/db.ts 實現)
      const res = await fetch('/api/db?action=list');
      const data = await res.json();
      if (data.success) setChannels(data.channels);
    } catch (e) {
      // 降級回 LocalStorage 以防 API 未設定
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFromDB();
    
    // 檢查 YouTube OAuth Code
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_v8_pending');
    if (code && pendingId) handleTokenExchange(code, pendingId);
  }, []);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const saveToDB = async (updatedChannels: ChannelConfig[]) => {
    setChannels(updatedChannels);
    localStorage.setItem('pilot_v8_data', JSON.stringify(updatedChannels));
    // 同步到 Firebase
    await fetch('/api/db?action=sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: updatedChannels })
    });
  };

  const handleTokenExchange = async (code: string, id: string) => {
    window.history.replaceState({}, document.title, "/");
    localStorage.removeItem('pilot_v8_pending');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        const next = channels.map(c => c.id === id ? { ...c, auth: data.tokens } : c);
        await saveToDB(next);
        addLog("YouTube 頻道連結成功！已同步至雲端。");
      }
    } catch (e: any) { addLog(`授權失敗: ${e.message}`); }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  const runPipeline = async (channel: ChannelConfig) => {
    addLog(`🚀 手動啟動頻道: ${channel.name}`);
    setChannels(p => p.map(c => c.id === channel.id ? { ...c, status: 'running', lastLog: '正在初始化...' } : c));
    
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'full_flow', channel })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✅ 發布成功: ${channel.name}`);
        fetchFromDB(); // 重新整理狀態
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      addLog(`❌ 失敗: ${e.message}`);
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, status: 'error', lastLog: e.message } : c));
    }
  };

  const openEdit = (c: ChannelConfig) => {
    setEditingId(c.id);
    setNewChan({
      name: c.name,
      niche: c.niche,
      language: c.language || 'zh-TW',
      schedule: c.schedule || { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true }
    });
    setIsModalOpen(true);
  };

  const saveChannel = async () => {
    let next: ChannelConfig[];
    if (editingId) {
      next = channels.map(c => c.id === editingId ? { ...c, ...newChan } : c);
    } else {
      const c: ChannelConfig = {
        id: 'ch_' + Math.random().toString(36).substr(2, 9),
        ...newChan,
        auth: null,
        status: 'idle',
        step: 0
      };
      next = [...channels, c];
    }
    await saveToDB(next);
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black italic shadow-lg text-white">S</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500 text-xs px-2 py-1 bg-white/10 rounded-lg ml-2">PRO</span></h1>
        </div>
        <div className="flex gap-4">
           <button onClick={fetchFromDB} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-colors">
              <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
           </button>
           <button onClick={() => setIsModalOpen(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-900/40">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-8 shadow-2xl relative group hover:border-indigo-500/50 transition-all">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-black text-white">{c.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${c.language === 'en' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'}`}>
                        {c.language === 'en' ? 'English' : '繁體中文'}
                      </span>
                      <span className="bg-slate-800 text-slate-400 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-slate-700">{c.niche}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {['日','一','二','三','四','五','六'].map((d, i) => (
                        <span key={i} className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-lg font-bold ${c.schedule?.activeDays.includes(i) ? 'bg-indigo-600 text-white' : 'bg-slate-800/50 text-slate-600 border border-slate-800'}`}>{d}</span>
                      ))}
                      <span className="ml-2 text-indigo-400 font-mono font-bold flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {c.schedule?.time}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${c.status === 'running' ? 'bg-blue-500 animate-pulse' : c.status === 'success' ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                      <p className={`text-sm font-semibold truncate max-w-md ${c.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{c.lastLog || '等待雲端排程觸發...'}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => openEdit(c)} className="p-3 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-2xl transition-all border border-slate-700">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-2xl font-bold hover:bg-amber-600/20 transition-all">連結 YouTube</button>
                    ) : (
                      <button disabled={c.status === 'running'} onClick={() => runPipeline(c)} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold disabled:bg-slate-800 transition-all">
                        {c.status === 'running' ? '雲端執行中' : '立即手動發布'}
                      </button>
                    )}
                    <button onClick={async () => { if(confirm('確定刪除？')) await saveToDB(channels.filter(x => x.id !== c.id)) }} className="p-3 bg-slate-800 text-slate-500 hover:bg-red-600 hover:text-white rounded-2xl transition-all border border-slate-700">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {channels.length === 0 && !isLoading && (
              <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-[2rem]">
                <p className="text-slate-500 font-bold">目前沒有任何頻道，點擊右上角新增。</p>
              </div>
            )}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-slate-950/50 p-6 flex flex-col shadow-2xl">
          <div className="p-5 bg-indigo-600/10 border border-indigo-600/20 rounded-2xl mb-6">
            <h4 className="text-xs font-black text-indigo-400 uppercase mb-2 flex items-center gap-2">
               <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
               Cloud Autopilot Status
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
               Vercel Cron 每小時會連線至您的 Firebase 讀取設定。設定完成後，您可以放心關閉此網頁，系統將在背景自動運作。
            </p>
          </div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-2 flex justify-between">
            <span>操作日誌</span>
            <button onClick={() => setGlobalLog([])} className="hover:text-white">清除</button>
          </h3>
          <div className="space-y-2 font-mono text-[10px] flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-2.5 rounded-xl border ${log.includes('✅') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : log.includes('❌') ? 'bg-red-950/20 text-red-400 border-red-900/30' : 'bg-slate-900/50 text-slate-500 border-slate-800'}`}> {log} </div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[3rem] p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-white italic uppercase mb-8 flex items-center gap-3">
               <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-sm">⚙️</div>
               {editingId ? '編輯頻道設定' : '新增自動化頻道'}
            </h2>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">頻道名稱 (標記用)</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="我的主頻道" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">內容領域 (Niche)</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="AI 繪圖, 財經知識..." value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">標題/描述 語言 (Output Language)</label>
                <div className="flex gap-4">
                  <button onClick={() => setNewChan({...newChan, language: 'zh-TW'})} className={`flex-1 py-4 rounded-2xl font-bold border transition-all ${newChan.language === 'zh-TW' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}>繁體中文</button>
                  <button onClick={() => setNewChan({...newChan, language: 'en'})} className={`flex-1 py-4 rounded-2xl font-bold border transition-all ${newChan.language === 'en' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}>English</button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">自動排程星期 (每週)</label>
                <div className="flex justify-between gap-2">
                  {['日','一','二','三','四','五','六'].map((d, i) => (
                    <button key={i} onClick={() => {
                      const days = newChan.schedule.activeDays.includes(i) ? newChan.schedule.activeDays.filter(x => x !== i) : [...newChan.schedule.activeDays, i].sort();
                      setNewChan({...newChan, schedule: {...newChan.schedule, activeDays: days}});
                    }} className={`w-10 h-10 rounded-xl font-bold border transition-all ${newChan.schedule.activeDays.includes(i) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{d}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">發片時間</label>
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, time: e.target.value}})} />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">排程狀態</label>
                   <button onClick={() => setNewChan({...newChan, schedule: {...newChan.schedule, autoEnabled: !newChan.schedule.autoEnabled}})} className={`w-full py-4 rounded-2xl font-bold border transition-all ${newChan.schedule.autoEnabled ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' : 'bg-red-600/20 border-red-500 text-red-400'}`}>
                      {newChan.schedule.autoEnabled ? '● 排程已啟用' : '○ 排程已停用'}
                   </button>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button onClick={closeModal} className="flex-1 py-4 text-slate-500 font-bold hover:text-white">取消</button>
                <button onClick={saveChannel} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-lg transition-all">儲存並同步雲端</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
