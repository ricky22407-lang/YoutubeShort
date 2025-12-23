
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGAS, setShowGAS] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pollInterval = useRef<number | null>(null);
  
  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } as ScheduleConfig
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);

  const generateGASScript = () => {
    const baseUrl = window.location.origin;
    const firebaseId = process.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID';
    return `
/**
 * ShortsPilot ONYX - Cloud Trigger Script
 * Deployment: ${baseUrl}
 */
function hourlyCheck() {
  const API_ENDPOINT = "${baseUrl}/api/pipeline";
  const DB_URL = "https://${firebaseId}.firebaseio.com/channels.json";
  
  try {
    const res = UrlFetchApp.fetch(DB_URL);
    const data = JSON.parse(res.getContentText());
    const channels = Array.isArray(data) ? data : Object.values(data);
    
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    channels.forEach(channel => {
      if (channel.status === 'running') return;
      if (!channel.auth) return;
      
      const schedule = channel.schedule;
      if (!schedule || !schedule.autoEnabled) return;
      if (!schedule.activeDays.includes(currentDay)) return;
      
      const [schedH] = (schedule.time || "00:00").split(':');
      if (currentHour === parseInt(schedH)) {
        const lastRun = channel.lastRunTime || 0;
        const diff = (Date.now() - lastRun) / (1000 * 60 * 60);
        
        if (diff > 20) {
          UrlFetchApp.fetch(API_ENDPOINT, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify({ stage: "full_flow", channel: channel })
          });
        }
      }
    });
  } catch (e) {
    Logger.log("ONYX_GAS_ERROR: " + e.toString());
  }
}
    `.trim();
  };

  const fetchFromDB = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/db?action=list');
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        const hasRunning = (data.channels || []).some((c: any) => c.status === 'running');
        if (hasRunning && !pollInterval.current) startPolling();
        else if (!hasRunning && pollInterval.current) stopPolling();
      }
    } catch (e) {
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
    }
    if (!silent) setIsLoading(false);
  };

  const startPolling = () => {
    if (pollInterval.current) return;
    pollInterval.current = window.setInterval(() => fetchFromDB(true), 3000);
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

  const handleManualTrigger = async (channel: ChannelConfig) => {
    if (channel.status === 'running') return;
    if (!channel.auth) return alert("請先連結 YouTube 授權");
    
    addLog(`🚀 手動啟動頻道流程: ${channel.name}`);
    const optimistic: ChannelConfig[] = channels.map(c => 
      c.id === channel.id ? { ...c, status: 'running' as 'running', step: 10, lastLog: '初始化引擎...' } : c
    );
    await saveToDB(optimistic);
    startPolling();

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'full_flow', channel })
      });
      const data = await res.json();
      if (!data.success) addLog(`❌ 流程中斷: ${data.error}`);
    } catch (e: any) {
      addLog(`❌ 系統錯誤: ${e.message}`);
    }
  };

  const handleTokenExchange = async (code: string, id: string) => {
    window.history.replaceState({}, document.title, "/");
    localStorage.removeItem('pilot_v8_pending');
    addLog("正在交換 YouTube 權限金鑰...");
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
        addLog("✅ 授權已儲存至雲端");
      }
    } catch (e: any) { addLog(`❌ 授權失敗: ${e.message}`); }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
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
    const finalSchedule = { ...newChan.schedule, autoEnabled: true };

    if (editingId) {
      next = channels.map(c => c.id === editingId ? { ...c, ...newChan, schedule: finalSchedule } : c);
    } else {
      const channel: ChannelConfig = {
        id: Math.random().toString(36).substring(2, 9),
        status: 'idle',
        name: newChan.name,
        niche: newChan.niche,
        language: newChan.language,
        schedule: finalSchedule,
        history: [],
        auth: null,
        step: 0
      };
      next = [...channels, channel];
    }
    await saveToDB(next);
    setIsModalOpen(false);
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-slate-300">
      <nav className="p-6 border-b border-white/5 bg-black sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black text-black text-xl italic">S</div>
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">ShortsPilot <span className="text-cyan-400">ONYX</span></h1>
            <p className="text-[10px] font-bold text-slate-600 tracking-[0.2em] mt-1">BLACK EDITION V8</p>
          </div>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowGAS(true)} className="px-5 py-2.5 bg-zinc-900/50 hover:bg-zinc-800 text-slate-400 rounded-lg font-bold transition-all border border-white/5 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
              雲端 GAS 部署
           </button>
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); }} className="px-8 py-2.5 bg-white hover:bg-slate-200 text-black rounded-lg font-black transition-all">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-10">
            {channels.length === 0 && !isLoading && (
              <div className="text-center py-32 bg-zinc-950/50 border border-white/5 rounded-[3rem]">
                <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">NO CHANNELS CONFIGURED</p>
              </div>
            )}

            {channels.map(c => (
              <div key={c.id} className={`onyx-card rounded-[3rem] p-12 transition-all relative overflow-hidden ${c.status === 'running' ? 'ring-2 ring-cyan-500/20' : ''}`}>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12 relative z-10">
                  <div className="flex-1 space-y-8">
                    <div className="flex items-center gap-6">
                      <h2 className="text-4xl font-black text-white tracking-tight italic">{c.name}</h2>
                      <span className="bg-zinc-900 text-slate-400 text-[10px] px-3 py-1 rounded-md font-bold uppercase tracking-widest border border-white/10">{c.niche}</span>
                      {c.status === 'running' && <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse-fast shadow-[0_0_10px_#00d2ff]"></div>}
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex bg-black p-1.5 rounded-xl border border-white/5">
                        {['日','一','二','三','四','五','六'].map((d, i) => (
                          <div key={i} className={`w-10 h-10 flex items-center justify-center rounded-lg font-black text-xs transition-all ${c.schedule?.activeDays.includes(i) ? 'bg-white text-black' : 'text-zinc-800'}`}>
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="bg-black p-3 px-6 rounded-xl border border-white/5">
                        <span className="text-slate-500 font-mono font-bold text-sm tracking-widest">{c.schedule?.time}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-end mb-1">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">{c.lastLog || '等待任務中...'}</p>
                        <span className="text-xs font-black text-cyan-400 font-mono">{(c.step || 0)}%</span>
                      </div>
                      <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                        <div 
                          className={`h-full bg-cyan-400 transition-all duration-1000 ease-out ${c.status === 'running' ? 'laser-progress' : ''}`}
                          style={{ width: `${c.step || 0}%`, boxShadow: '0 0 10px rgba(0,210,255,0.5)' }}
                        ></div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 mt-6">
                        {[
                          { label: '趨勢分析', min: 10 },
                          { label: '內容企劃', min: 30 },
                          { label: '影片生成', min: 50 },
                          { label: '雲端上傳', min: 90 }
                        ].map((s, idx) => (
                          <div key={idx} className="space-y-2">
                             <div className={`h-0.5 rounded-full transition-all duration-500 ${ (c.step || 0) >= s.min ? 'bg-cyan-400' : 'bg-zinc-900' }`}></div>
                             <p className={`text-[9px] font-black uppercase text-center tracking-tighter ${ (c.step || 0) >= s.min ? 'text-white' : 'text-zinc-800' }`}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-4 relative z-20">
                    <button onClick={() => openEdit(c)} disabled={c.status === 'running'} className="p-6 bg-zinc-900/50 text-slate-500 hover:text-white rounded-2xl border border-white/5 transition-all disabled:opacity-20 hover:border-white/20">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </button>
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-8 py-4 bg-zinc-900 text-white border border-white/10 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-all">連結授權</button>
                    ) : (
                      <button 
                        onClick={() => handleManualTrigger(c)} 
                        disabled={c.status === 'running'}
                        className={`px-10 py-5 rounded-2xl font-black transition-all border text-sm uppercase tracking-widest ${c.status === 'running' ? 'bg-zinc-900 text-zinc-700 border-white/5' : 'bg-cyan-500 hover:bg-cyan-400 text-black border-cyan-400/20'}`}
                      >
                        {c.status === 'running' ? '引擎運作中' : '即刻執行'}
                      </button>
                    )}
                  </div>
                </div>

                {c.history && c.history.length > 0 && (
                  <div className="mt-12 pt-12 border-t border-white/5 relative z-10">
                    <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] mb-8">CLOUD PUBLISH HISTORY</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {c.history.map((record, idx) => (
                        <div key={idx} className="flex items-center justify-between p-6 bg-black rounded-2xl border border-white/5 group/item hover:border-cyan-500/30 transition-all">
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-white text-xs font-bold truncate pr-6">{record.title}</span>
                            <span className="text-[10px] text-slate-700 font-mono mt-2 uppercase tracking-tighter">{new Date(record.publishedAt).toLocaleString()}</span>
                          </div>
                          <a href={record.url} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/5 text-slate-500 rounded-xl hover:bg-white hover:text-black transition-all border border-white/5 shrink-0">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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

        <aside className="w-full lg:w-96 border-l border-white/5 bg-black p-10 flex flex-col">
          <div className="mb-12">
            <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.4em] mb-6 flex items-center gap-3">
               <div className="w-2 h-2 bg-cyan-400 rounded-full animate-glow"></div>
               SYSTEM STATUS
            </h4>
            <div className="p-6 bg-zinc-950/50 border border-white/5 rounded-2xl">
               <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  系統目前處於 **ONYX MODE**。所有資源已優化至純黑極簡模式。正在監聽 Google Apps Script 的定時調用請求。
               </p>
            </div>
          </div>
          <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] mb-8 px-2">REALTIME TRAFFIC</h3>
          <div className="space-y-4 font-mono text-[10px] flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-5 rounded-xl border transition-all ${log.includes('✅') ? 'bg-cyan-500/5 text-cyan-400 border-cyan-500/20 shadow-[0_0_15px_rgba(0,210,255,0.05)]' : 'bg-zinc-950/40 text-slate-600 border-white/5'}`}> {log} </div>
            ))}
          </div>
        </aside>
      </div>

      {showGAS && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100] animate-fade-in">
          <div className="bg-zinc-950 border border-white/10 w-full max-w-4xl rounded-[4rem] p-16 shadow-2xl relative overflow-hidden">
            <h2 className="text-4xl font-black text-white italic uppercase mb-12 tracking-tighter">部署雲端核心 (GAS)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
               <div className="space-y-6">
                  <div className="flex items-start gap-6 p-8 bg-black rounded-3xl border border-white/5">
                     <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-white font-black text-xl italic shrink-0">1</div>
                     <p className="text-xs text-slate-500 leading-relaxed">開啟 Google Apps Script，貼入下方腳本。這將作為 App 的外部驅動源。</p>
                  </div>
                  <div className="flex items-start gap-6 p-8 bg-black rounded-3xl border border-white/5">
                     <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-white font-black text-xl italic shrink-0">2</div>
                     <p className="text-xs text-slate-500 leading-relaxed">點擊左側時鐘按鈕，新增觸發器，選擇 `hourlyCheck` 並設定為「每小時執行」。</p>
                  </div>
               </div>
               <div className="bg-cyan-500/5 border border-cyan-500/20 p-8 rounded-[3rem] flex flex-col justify-center">
                  <p className="text-xs text-cyan-400 leading-relaxed font-bold uppercase tracking-widest mb-4">為什麼選擇 ONYX 雲端？</p>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                     不依賴本地電腦資源，完全託管於 Google Cloud 基礎設施。這意味著即使您關閉所有分頁，系統仍會精確地在指定時間自動發片。
                  </p>
               </div>
            </div>
            <textarea readOnly className="w-full h-64 bg-black border border-white/5 rounded-3xl p-10 text-[11px] font-mono text-cyan-400 outline-none mb-10 shadow-inner custom-scrollbar" value={generateGASScript()} />
            <div className="flex gap-6">
              <button onClick={() => { navigator.clipboard.writeText(generateGASScript()); addLog("雲端腳本已複製"); }} className="flex-1 py-6 bg-white text-black rounded-3xl font-black transition-all uppercase tracking-widest text-xs">複製腳本內容</button>
              <button onClick={() => setShowGAS(false)} className="flex-1 py-6 bg-zinc-900 text-slate-400 rounded-3xl font-black transition-all uppercase tracking-widest text-xs border border-white/5">部署完成</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100] animate-fade-in">
          <div className="bg-zinc-950 border border-white/10 w-full max-w-2xl rounded-[4rem] p-16 shadow-2xl relative">
             <h2 className="text-3xl font-black text-white italic uppercase mb-12 tracking-tighter">{editingId ? '編輯現有頻道' : '新增 ONYX 頻道'}</h2>
             <div className="space-y-10">
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] px-1">CHANNEL NAME</label>
                  <input className="w-full bg-black border border-white/5 rounded-2xl p-6 text-white font-bold outline-none focus:border-cyan-500/50 transition-all" placeholder="例如：科學研究室" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] px-1">CONTENT NICHE</label>
                  <input className="w-full bg-black border border-white/5 rounded-2xl p-6 text-white font-bold outline-none focus:border-cyan-500/50 transition-all" placeholder="例如：ASMR" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                </div>
              </div>
              
              <div className="space-y-5">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] px-1">WEEKLY SCHEDULE</label>
                <div className="grid grid-cols-7 gap-3 bg-black p-2.5 rounded-2xl border border-white/5 shadow-inner">
                  {['日','一','二','三','四','五','六'].map((d, i) => (
                    <button key={i} onClick={() => {
                      const days = newChan.schedule.activeDays.includes(i) ? newChan.schedule.activeDays.filter(x => x !== i) : [...newChan.schedule.activeDays, i].sort();
                      setNewChan({...newChan, schedule: {...newChan.schedule, activeDays: days}});
                    }} className={`aspect-square rounded-xl font-black transition-all flex items-center justify-center text-xs ${newChan.schedule.activeDays.includes(i) ? 'bg-white text-black' : 'bg-zinc-950 text-slate-700 hover:text-white'}`}>{d}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] px-1">PUBLISH TIME</label>
                  <input type="time" className="w-full bg-black border border-white/5 rounded-2xl p-6 text-white font-black outline-none focus:border-cyan-500/50 transition-all" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, time: e.target.value}})} />
                </div>
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em] px-1">LANGUAGE</label>
                   <select className="w-full bg-black border border-white/5 rounded-2xl p-6 text-white font-black outline-none" value={newChan.language} onChange={e => setNewChan({...newChan, language: e.target.value as any})}>
                      <option value="zh-TW">繁體中文</option>
                      <option value="en">English (US)</option>
                   </select>
                </div>
              </div>

              <div className="flex gap-6 pt-12">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 text-slate-600 font-black hover:text-white transition-colors uppercase tracking-[0.2em] text-[10px]">DISCARD</button>
                <button onClick={saveChannel} className="flex-1 py-6 bg-white hover:bg-slate-200 text-black rounded-3xl font-black transition-all uppercase tracking-[0.2em] text-[10px]">SAVE CHANGES</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
