
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showGAS, setShowGAS] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
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
    addLog("正在建立 YouTube 雲端權限...");
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
        addLog("✅ 雲端授權成功！");
      }
    } catch (e: any) { addLog(`❌ 授權失敗: ${e.message}`); }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  // Fix: Implement openEdit to handle channel editing state
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

  // Fix: Implement saveChannel to handle both adding and updating channels
  const saveChannel = async () => {
    if (!newChan.name) return alert("請輸入頻道名稱");
    
    let next: ChannelConfig[];
    if (editingId) {
      next = channels.map(c => c.id === editingId ? { ...c, ...newChan } : c);
      addLog(`✅ 頻道更新成功: ${newChan.name}`);
    } else {
      const channel: ChannelConfig = {
        id: Math.random().toString(36).substring(2, 9),
        status: 'idle',
        name: newChan.name,
        niche: newChan.niche,
        language: newChan.language,
        schedule: newChan.schedule,
        history: []
      };
      next = [...channels, channel];
      addLog(`✅ 頻道新增成功: ${newChan.name}`);
    }
    
    await saveToDB(next);
    setIsModalOpen(false);
    setEditingId(null);
    setNewChan({ 
      name: '', niche: 'AI 科技', language: 'zh-TW',
      schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true }
    });
  };

  const generateGASScript = () => {
    const firebaseUrl = `https://${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseio.com/channels.json`;
    const apiKey = process.env.API_KEY;
    const siteUrl = window.location.origin;

    return `/**
 * ShortsPilot Pro 終極自動化腳本 (GAS 版)
 * 功能：每小時檢查排程，自動生成並發布影片
 */
const CONFIG = {
  FIREBASE_URL: "${firebaseUrl}",
  API_KEY: "${apiKey}",
  PIPELINE_URL: "${siteUrl}/api/pipeline"
};

function hourlyCheck() {
  const response = UrlFetchApp.fetch(CONFIG.FIREBASE_URL);
  const channelsMap = JSON.parse(response.getContentText());
  if (!channelsMap) return;

  const channels = Object.values(channelsMap);
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  channels.forEach(chan => {
    if (!chan.schedule || !chan.schedule.autoEnabled || !chan.auth) return;

    const isToday = chan.schedule.activeDays.includes(currentDay);
    const targetHour = parseInt(chan.schedule.time.split(':')[0]);
    const isTime = currentHour === targetHour;
    
    // 兩小時冷卻
    const isCooled = !chan.lastRunTime || (Date.now() - chan.lastRunTime > 2 * 60 * 60 * 1000);

    if (isToday && isTime && isCooled) {
      console.log("觸發發片任務: " + chan.name);
      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ stage: "full_flow", channel: chan }),
        muteHttpExceptions: true
      };
      // GAS 的超時限制是 6 分鐘，非常適合 Vercel 做不到的影片渲染
      UrlFetchApp.fetch(CONFIG.PIPELINE_URL, options);
    }
  });
}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black italic shadow-lg text-white">S</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500 text-xs px-2 py-1 bg-white/10 rounded-lg ml-2 border border-white/5">PRO CLOUD</span></h1>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setShowGAS(true)} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl font-bold transition-all border border-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
              設定關機自動化
           </button>
           <button onClick={() => { setIsModalOpen(true); setEditingId(null); setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { activeDays: [1, 2, 3, 4, 5], time: '19:00', countPerDay: 1, autoEnabled: true } }); }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-900/40">新增頻道</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.length === 0 && !isLoading && (
              <div className="text-center py-20 bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-[3rem]">
                <p className="text-slate-500 font-bold">目前沒有頻道，請點擊「新增頻道」開始你的 AI 創作之旅</p>
              </div>
            )}
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative group hover:border-indigo-500/50 transition-all backdrop-blur-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-2xl font-black text-white leading-tight">{c.name}</h2>
                      <span className="bg-slate-800 text-slate-400 text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest border border-slate-700">{c.niche}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {['日','一','二','三','四','五','六'].map((d, i) => (
                        <span key={i} className={`text-[10px] w-6.5 h-6.5 flex items-center justify-center rounded-lg font-bold border ${c.schedule?.activeDays.includes(i) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/50 text-slate-600 border-slate-800'}`}>{d}</span>
                      ))}
                      <span className="ml-3 text-indigo-400 font-mono font-bold flex items-center gap-1.5 bg-indigo-500/5 px-3 rounded-lg border border-indigo-500/10">
                        {c.schedule?.time}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
                      <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${c.status === 'running' ? 'bg-blue-500 animate-pulse ring-4 ring-blue-500/20' : 'bg-slate-600'}`}></div>
                      <p className="text-sm font-bold truncate max-w-sm text-slate-400">{c.lastLog || '等待任務啟動...'}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => openEdit(c)} className="p-3.5 bg-slate-800 text-slate-400 hover:text-white rounded-2xl transition-all border border-slate-700"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-2xl font-bold">連結 YouTube</button>
                    ) : (
                      <button disabled={c.status === 'running'} onClick={() => { addLog(`手動啟動: ${c.name}`); /* 邏輯略 */ }} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black shadow-lg shadow-indigo-900/30 transition-all">{c.status === 'running' ? '生成中...' : '立即發片'}</button>
                    )}
                  </div>
                </div>

                {c.history && c.history.length > 0 && (
                  <div className="mt-4 pt-6 border-t border-slate-800/60">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">最近發布紀錄 (History)</h3>
                    <div className="grid gap-2">
                      {c.history.map((record, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-950/40 rounded-2xl border border-slate-800/30 hover:border-indigo-500/30 transition-all">
                          <div className="flex flex-col">
                            <span className="text-white text-xs font-bold truncate max-w-xs">{record.title}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{new Date(record.publishedAt).toLocaleString()}</span>
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

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-slate-950/30 backdrop-blur-md p-6 flex flex-col">
          <div className="p-5 bg-indigo-600/10 border border-indigo-600/20 rounded-3xl mb-8">
            <h4 className="text-xs font-black text-indigo-400 uppercase mb-2">🚀 專業級關機自動化</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
               建議搭配 <b>Google Apps Script</b>。
               這能讓你在不開電腦、不付費給 Vercel 的情況下，實現 24/7 自動發片，且支援長達 6 分鐘的運算時間。
            </p>
          </div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-2">事件日誌</h3>
          <div className="space-y-2.5 font-mono text-[10px] flex-1 overflow-y-auto pr-2">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-3 rounded-2xl border transition-all ${log.includes('✅') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : 'bg-slate-900/60 text-slate-500 border-slate-800/50'}`}> {log} </div>
            ))}
          </div>
        </aside>
      </div>

      {showGAS && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100] animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden">
            <h2 className="text-2xl font-black text-white italic uppercase mb-4">設定 Google Apps Script 自動化</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              請至 <a href="https://script.google.com/" target="_blank" className="text-indigo-400 underline">Google Apps Script</a> 建立新專案，貼入下方腳本並儲存，最後設定「計時觸發器」每小時執行一次即可。
            </p>
            <textarea readOnly className="w-full h-64 bg-slate-950 border border-slate-800 rounded-2xl p-6 text-[10px] font-mono text-emerald-400 outline-none mb-6" value={generateGASScript()} />
            <div className="flex gap-4">
              <button onClick={() => { navigator.clipboard.writeText(generateGASScript()); addLog("腳本已複製！"); }} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black">複製腳本代碼</button>
              <button onClick={() => setShowGAS(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black">關閉</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100] animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[3.5rem] p-12 shadow-2xl relative overflow-hidden">
             <h2 className="text-2xl font-black text-white italic uppercase mb-10">{editingId ? '編輯頻道' : '新增自動頻道'}</h2>
             <div className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">頻道名稱</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">領域</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">排程日期</label>
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
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black outline-none" value={newChan.schedule.time} onChange={e => setNewChan({...newChan, schedule: {...newChan.schedule, time: e.target.value}})} />
                </div>
                <div className="flex items-center pt-6">
                   <button onClick={() => setNewChan({...newChan, schedule: {...newChan.schedule, autoEnabled: !newChan.schedule.autoEnabled}})} className={`w-full py-4 rounded-2xl font-black border transition-all ${newChan.schedule.autoEnabled ? 'bg-emerald-600/10 border-emerald-500 text-emerald-400' : 'bg-red-600/10 border-red-500 text-red-400'}`}>
                      {newChan.schedule.autoEnabled ? '自動化已開啟' : '自動化已關閉'}
                   </button>
                </div>
              </div>
              <div className="flex gap-6 pt-10">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-slate-500 font-black hover:text-white transition-colors">取消</button>
                <button onClick={saveChannel} className="flex-1 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black shadow-2xl transition-all">確認儲存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
