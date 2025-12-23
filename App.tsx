
import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScheduleConfig, PublicationRecord } from './types';

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

  const fetchFromDB = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/db?action=list');
      const data = await res.json();
      if (data.success) setChannels(data.channels || []);
    } catch (e) {
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFromDB();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_v8_pending');
    if (code && pendingId) handleTokenExchange(code, pendingId);
  }, []);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const saveToDB = async (updatedChannels: ChannelConfig[]) => {
    setChannels(updatedChannels);
    localStorage.setItem('pilot_v8_data', JSON.stringify(updatedChannels));
    try {
      await fetch('/api/db?action=sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: updatedChannels })
      });
    } catch (e) { console.error("Sync failed", e); }
  };

  const handleTokenExchange = async (code: string, id: string) => {
    window.history.replaceState({}, document.title, "/");
    localStorage.removeItem('pilot_v8_pending');
    addLog("正在與 YouTube 建立安全連結...");
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
        addLog("✅ YouTube 頻道連結成功！已加密同步至雲端。");
      }
    } catch (e: any) { addLog(`❌ 授權失敗: ${e.message}`); }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  const runPipeline = async (channel: ChannelConfig) => {
    addLog(`🚀 手動啟動頻道: ${channel.name}`);
    setChannels(p => p.map(c => c.id === channel.id ? { ...c, status: 'running', lastLog: 'AI 企劃中...' } : c));
    
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'full_flow', channel })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✅ 發布成功: ${channel.name}`);
        fetchFromDB();
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
    if (!newChan.name) return alert("請輸入名稱");
    let next: ChannelConfig[];
    if (editingId) {
      next = channels.map(c => c.id === editingId ? { ...c, ...newChan } : c);
      addLog(`更新頻道設定: ${newChan.name}`);
    } else {
      const c: ChannelConfig = {
        id: 'ch_' + Math.random().toString(36).substr(2, 9),
        ...newChan,
        auth: null,
        status: 'idle',
        step: 0,
        history: []
      };
      next = [...channels, c];
      addLog(`建立新頻道: ${newChan.name}`);
    }
    await saveToDB(next);
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black italic shadow-lg text-white">S</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500 text-xs px-2 py-1 bg-white/10 rounded-lg ml-2 border border-white/5">PRO CLOUD</span></h1>
        </div>
        <div className="flex gap-4">
           <button onClick={fetchFromDB} className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all border border-slate-700">
              <svg className={`w-5 h-5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
           </button>
           <button onClick={() => setIsModalOpen(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-900/40">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative group hover:border-indigo-500/50 transition-all backdrop-blur-sm overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-2xl font-black text-white leading-tight">{c.name}</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${c.language === 'en' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'}`}>
                        {c.language === 'en' ? 'English' : '繁體中文'}
                      </span>
                      <span className="bg-slate-800 text-slate-400 text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest border border-slate-700">{c.niche}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {['日','一','二','三','四','五','六'].map((d, i) => (
                        <span key={i} className={`text-[10px] w-6.5 h-6.5 flex items-center justify-center rounded-lg font-bold border ${c.schedule?.activeDays.includes(i) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/50 text-slate-600 border-slate-800'}`}>{d}</span>
                      ))}
                      <span className="ml-3 text-indigo-400 font-mono font-bold flex items-center gap-1.5 bg-indigo-500/5 px-3 rounded-lg border border-indigo-500/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {c.schedule?.time}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                      <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${c.status === 'running' ? 'bg-blue-500 animate-pulse ring-4 ring-blue-500/20' : c.status === 'success' ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-slate-600'}`}></div>
                      <p className={`text-sm font-bold truncate max-w-sm ${c.status === 'error' ? 'text-red-400' : 'text-slate-400'}`}>{c.lastLog || '等待雲端排程器啟動...'}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => openEdit(c)} className="p-3.5 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-2xl transition-all border border-slate-700 group/btn">
                      <svg className="w-6 h-6 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-2xl font-bold hover:bg-amber-600/20 transition-all shadow-lg shadow-amber-900/10">連結 YouTube</button>
                    ) : (
                      <button disabled={c.status === 'running'} onClick={() => runPipeline(c)} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black disabled:bg-slate-800 transition-all shadow-lg shadow-indigo-900/30">
                        {c.status === 'running' ? '雲端渲染中' : '手動啟動'}
                      </button>
                    )}
                    <button onClick={async () => { if(confirm(`確定刪除頻道「${c.name}」？`)) await saveToDB(channels.filter(x => x.id !== c.id)) }} className="p-3.5 bg-slate-800 text-slate-500 hover:bg-red-600/20 hover:text-red-500 rounded-2xl transition-all border border-slate-700">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* 發布歷史紀錄區塊 */}
                {c.history && c.history.length > 0 && (
                  <div className="mt-4 pt-6 border-t border-slate-800/60">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 px-1 flex items-center gap-2">
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       最近發布紀錄 (History)
                    </h3>
                    <div className="grid gap-2">
                      {c.history.map((record, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-950/40 rounded-2xl border border-slate-800/30 hover:border-indigo-500/30 transition-all group/record">
                          <div className="flex flex-col">
                            <span className="text-white text-xs font-bold truncate max-w-[200px] md:max-w-sm mb-1">{record.title}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{new Date(record.publishedAt).toLocaleString('zh-TW')}</span>
                          </div>
                          <a href={record.url} target="_blank" rel="noopener noreferrer" className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-slate-950/30 backdrop-blur-md p-6 flex flex-col shadow-2xl">
          <div className="p-5 bg-indigo-600/10 border border-indigo-600/20 rounded-3xl mb-8">
            <h4 className="text-xs font-black text-indigo-400 uppercase mb-3 flex items-center gap-2">
               <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
               雲端自動化狀態 (Cron)
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed font-bold">
               系統已連結 Firebase 數據庫。Vercel Cron 將定時掃描並執行。即使您關閉瀏覽器，雲端伺服器仍會按時生成並上傳影片。
            </p>
          </div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-2 flex justify-between items-center">
            <span>實時事件紀錄</span>
            <button onClick={() => setGlobalLog([])} className="hover:text-white transition-colors">清空</button>
          </h3>
          <div className="space-y-2.5 font-mono text-[10px] flex-1 overflow-y-auto pr-2">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-3 rounded-2xl border transition-all ${log.includes('✅') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : log.includes('❌') ? 'bg-red-950/20 text-red-400 border-red-900/30' : 'bg-slate-900/60 text-slate-500 border-slate-800/50'}`}> {log} </div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100] animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50"></div>
            <h2 className="text-2xl font-black text-white italic uppercase mb-10 flex items-center gap-4">
               <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-lg shadow-xl shadow-indigo-900/40">⚙️</div>
               {editingId ? '編輯頻道設定' : '新增自動頻道'}
            </h2>
            
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">頻道名稱</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4.5 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" placeholder="例如：AI 科技生活" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">內容領域 (Niche)</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4.5 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" placeholder="例如：美食、理財" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">影片生成語言 (AI Language)</label>
                <div className="flex gap-4">
                  <button onClick={() => setNewChan({...newChan, language: 'zh-TW'})} className={`flex-1 py-4.5 rounded-2xl font-black border transition-all ${newChan.language === 'zh-TW' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}>繁體中文</button>
                  <button onClick={() => setNewChan({...newChan, language: 'en'})} className={`flex-1 py-4.5 rounded-2xl font-black border transition-all ${newChan.language === 'en' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}>ENGLISH</button>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">自動排程日期</label>
                <div className="flex justify-between gap-2.5">
                  {['日','一','二','三','四','五','六'].map((d, i) => (
                    <button key={i} onClick={() => {
                      const days = newChan.schedule.activeDays.includes(i) ? newChan.schedule.activeDays.filter(x => x !== i) : [...newChan.schedule.activeDays, i].sort();
                      setNewChan({...newChan, schedule: {...newChan.schedule, activeDays: days}});
                    }} className={`flex-1 aspect-square rounded-2xl font-black border transition-all flex items-center justify-center text-sm ${newChan.schedule.activeDays.includes(i) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{d}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">發片時間</label>
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4.5 text-white font-black outline-none" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, time: e.target.value}})} />
                </div>
                <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">雲端排程狀態</label>
                   <button onClick={() => setNewChan({...newChan, schedule: {...newChan.schedule, autoEnabled: !newChan.schedule.autoEnabled}})} className={`w-full py-4.5 rounded-2xl font-black border transition-all flex items-center justify-center gap-3 ${newChan.schedule.autoEnabled ? 'bg-emerald-600/10 border-emerald-500 text-emerald-400' : 'bg-red-600/10 border-red-500 text-red-400'}`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${newChan.schedule.autoEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                      {newChan.schedule.autoEnabled ? '自動化已開啟' : '自動化已關閉'}
                   </button>
                </div>
              </div>

              <div className="flex gap-6 pt-10">
                <button onClick={closeModal} className="flex-1 py-5 text-slate-500 font-black hover:text-white transition-colors">放棄</button>
                <button onClick={saveChannel} className="flex-1 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black shadow-2xl shadow-indigo-900/40 transition-all transform hover:-translate-y-1">確認儲存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
