
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig, SystemStatus } from './types';
import { db, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEFAULT_SCHEDULE: ScheduleConfig = { 
  activeDays: [0, 1, 2, 3, 4, 5, 6], 
  time: '19:00', 
  countPerDay: 1, 
  autoEnabled: true 
};

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  
  const [form, setForm] = useState({ 
    name: '', 
    niche: 'AI 科技', 
    language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { ...DEFAULT_SCHEDULE }
  });

  const checkInterval = useRef<any>(null);

  useEffect(() => {
    // 1. 處理 OAuth 回調
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) handleAuthCallback(code);

    if (isFirebaseConfigured && db) {
      addLog("系統連線：Firebase 雲端同步模式。");
      
      // 監聽全局引擎狀態
      onSnapshot(doc(db, "system", "status"), (doc) => {
        if (doc.exists()) setSystemStatus(doc.data() as SystemStatus);
      });

      // 監聽頻道列表
      const q = query(collection(db, "channels"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ ...doc.data() as ChannelConfig, id: doc.id }));
        setChannels(docs);
      });
      return () => unsubscribe();
    } else {
      addLog("系統連線：瀏覽器本地模式。");
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
    }
  }, []);

  const handleAuthCallback = async (code: string) => {
    const pendingId = localStorage.getItem('pilot_v8_pending');
    if (!pendingId) return;
    addLog("偵測到授權，正在交換 Token...");
    window.history.replaceState({}, document.title, window.location.pathname);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success && data.tokens) {
        addLog("✅ YouTube 連結成功！");
        await updateChannelInState(pendingId, { auth: data.tokens, cloudSynced: false });
        localStorage.removeItem('pilot_v8_pending');
      }
    } catch (e: any) {
      addLog(`❌ 連結失敗: ${e.message}`);
    }
  };

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const updateChannelInState = async (id: string, updates: Partial<ChannelConfig>) => {
    if (isFirebaseConfigured && db) {
      setIsSyncing(true);
      const ref = doc(db, "channels", id);
      await updateDoc(ref, { ...updates, lastSyncAt: Date.now(), cloudSynced: true });
      setIsSyncing(false);
    } else {
      setChannels(prev => {
        const next = prev.map(c => c.id === id ? { ...c, ...updates } : c);
        localStorage.setItem('pilot_v8_data', JSON.stringify(next));
        return next;
      });
    }
  };

  const openModal = (channel?: ChannelConfig) => {
    if (channel) {
      setEditingId(channel.id);
      setForm({
        name: channel.name,
        niche: channel.niche,
        language: channel.language || 'zh-TW',
        schedule: channel.schedule || { ...DEFAULT_SCHEDULE }
      });
    } else {
      setEditingId(null);
      setForm({ name: '', niche: 'AI 科技', language: 'zh-TW', schedule: { ...DEFAULT_SCHEDULE } });
    }
    setIsModalOpen(true);
  };

  const saveChannel = async () => {
    const id = editingId || Math.random().toString(36).substr(2, 9);
    const existing = channels.find(c => c.id === id);
    setIsSyncing(true);

    const channelData: ChannelConfig = {
      ...(existing || { auth: null, status: 'idle', step: 0 }),
      id,
      name: form.name || '未命名頻道',
      niche: form.niche,
      language: form.language,
      schedule: form.schedule,
      cloudSynced: true,
      lastSyncAt: Date.now()
    };

    if (isFirebaseConfigured && db) {
      await setDoc(doc(db, "channels", id), channelData, { merge: true });
      addLog(`[同步] 「${channelData.name}」設定已上傳雲端。`);
    } else {
      setChannels(prev => editingId ? prev.map(c => c.id === id ? channelData : c) : [...prev, channelData]);
      addLog(`[儲存] 「${channelData.name}」本地設定已更新。`);
    }
    setIsSyncing(false);
    setIsModalOpen(false);
  };

  const handleManualRun = async (channel: ChannelConfig) => {
    addLog(`[手動啟動] ${channel.name}...`);
    await updateChannelInState(channel.id, { status: 'running', lastLog: '手動觸發中...' });
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (e: any) {
      addLog(`❌ 錯誤: ${e.message}`);
      await updateChannelInState(channel.id, { status: 'error', lastLog: e.message });
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col font-sans">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/40 backdrop-blur-2xl sticky top-0 z-50 flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center font-black italic shadow-2xl rotate-3">S</div>
          <div>
            <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500 text-xs">v8.3</span></h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isFirebaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{isFirebaseConfigured ? 'Cloud Brain Link' : 'Local Only'}</span>
              </div>
              {systemStatus && (
                <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${Date.now() - systemStatus.lastHeartbeat < 120000 ? 'bg-indigo-500 animate-ping' : 'bg-rose-500'}`}></div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Engine Pulse</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => openModal()} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black transition-all shadow-xl shadow-indigo-900/40 text-sm">
          + 新增頻道
        </button>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => {
              const isCloudReady = c.auth && c.schedule?.autoEnabled && c.cloudSynced;
              return (
                <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group hover:border-indigo-500/40 transition-all duration-500">
                  
                  {/* Status Indicator Bar */}
                  <div className="absolute top-0 right-0 p-6 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${isCloudReady ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'}`}></div>
                       <span className={`text-[10px] font-black uppercase tracking-widest ${isCloudReady ? 'text-indigo-400' : 'text-slate-600'}`}>
                         {isCloudReady ? 'Cloud Active' : 'Sync Pending'}
                       </span>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${c.auth ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                      {c.auth ? '● Authorized' : '○ No Access'}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    <div className="flex-1 space-y-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-3xl font-black text-white">{c.name}</h2>
                          {isSyncing && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.niche}</span>
                          <span className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.language === 'en' ? 'EN' : 'ZH'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 py-2">
                        <div className="flex gap-1.5">
                          {['日','一','二','三','四','五','六'].map((d, i) => (
                            <div key={i} className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${c.schedule?.activeDays.includes(i) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800/50 text-slate-600'}`}>
                              {d}
                            </div>
                          ))}
                        </div>
                        <div className="h-8 w-px bg-slate-800"></div>
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600/10 border border-indigo-600/20 rounded-xl">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Trigger</span>
                          <span className="font-mono font-black text-white">{c.schedule?.time}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                         <p className={`text-sm font-bold ${c.status === 'running' ? 'text-indigo-400 animate-pulse' : c.status === 'error' ? 'text-rose-400' : 'text-slate-300'}`}>
                           {c.lastLog || '等待雲端或手動觸發...'}
                         </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 min-w-[200px]">
                      {!c.auth ? (
                        <button onClick={() => {
                          localStorage.setItem('pilot_v8_pending', c.id);
                          fetch('/api/auth?action=url').then(r => r.json()).then(d => window.location.href = d.url);
                        }} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black transition-all shadow-xl shadow-amber-900/30">授權 YouTube</button>
                      ) : (
                        <button disabled={c.status === 'running'} onClick={() => handleManualRun(c)} className={`w-full py-4 rounded-2xl font-black transition-all shadow-xl ${c.status === 'running' ? 'bg-slate-800 text-slate-600' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'}`}>
                          {c.status === 'running' ? '任務執行中' : '立即手動發布'}
                        </button>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => openModal(c)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-all">⚙️ 調整排程</button>
                        <button onClick={() => { if(confirm("刪除頻道？")) setChannels(prev => prev.filter(x => x.id !== c.id)) }} className="p-3 bg-slate-800 hover:bg-rose-900/40 hover:text-rose-500 text-slate-500 rounded-xl transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-[#020617] p-8 flex flex-col shadow-2xl z-10">
          <div className="mb-8 p-6 bg-slate-900/50 rounded-3xl border border-slate-800/50">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">雲端引擎健康度</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400">連線狀態</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${systemStatus?.engineStatus === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                  {systemStatus?.engineStatus || 'Offline'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400">最後心跳</span>
                <span className="text-[10px] font-mono text-slate-500">{systemStatus ? new Date(systemStatus.lastHeartbeat).toLocaleTimeString() : '--:--:--'}</span>
              </div>
            </div>
          </div>
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 text-center">活動日誌</h3>
          <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[10px]">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-3 rounded-xl border leading-relaxed ${log.includes('✅') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : log.includes('❌') ? 'bg-rose-950/20 text-rose-400 border-rose-900/30' : 'bg-slate-900/50 text-slate-500 border-slate-800'}`}>
                {log}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[3rem] p-10 shadow-2xl animate-slide-down">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-white italic uppercase">{editingId ? '編輯頻道設定' : '新增頻道'}</h2>
              {isSyncing && <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>}
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">頻道名稱</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">主軸 (Niche)</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={form.niche} onChange={e => setForm({...form, niche: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">自動排程 (星期幾)</label>
                <div className="flex justify-between gap-1.5">
                  {['日','一','二','三','四','五','六'].map((name, i) => (
                    <button key={i} onClick={() => {
                      const activeDays = form.schedule.activeDays.includes(i)
                        ? form.schedule.activeDays.filter(d => d !== i)
                        : [...form.schedule.activeDays, i].sort();
                      setForm({...form, schedule: {...form.schedule, activeDays}});
                    }} className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${form.schedule.activeDays.includes(i) ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">發布時間</label>
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={form.schedule.time} onChange={e => setForm({...form, schedule: {...form.schedule, time: e.target.value}})} />
                </div>
                <div className="flex items-end">
                   <button onClick={saveChannel} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 transition-all text-sm">
                     {editingId ? '儲存同步至雲端' : '確認建立並同步'}
                   </button>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-full py-2 text-slate-600 text-[10px] font-black uppercase tracking-widest">取消離開</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
