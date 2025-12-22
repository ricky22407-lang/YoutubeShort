
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';
import { db, syncChannelToCloud, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEFAULT_SCHEDULE: ScheduleConfig = { 
  activeDays: [1, 2, 3, 4, 5], 
  time: '19:00', 
  countPerDay: 1, 
  autoEnabled: true 
};

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // 統一的表單狀態
  const [form, setForm] = useState({ 
    name: '', 
    niche: 'AI 科技', 
    language: 'zh-TW' as 'zh-TW' | 'en',
    schedule: { ...DEFAULT_SCHEDULE }
  });

  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const checkInterval = useRef<any>(null);

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      addLog("偵測到 Firebase，已切換至【雲端同步模式】。");
      const q = query(collection(db, "channels"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ ...doc.data() as ChannelConfig, id: doc.id }));
        setChannels(docs);
      });
      return () => unsubscribe();
    } else {
      addLog("未偵測到 Firebase，目前為【本地模式】。");
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
      checkInterval.current = setInterval(checkLocalSchedules, 60000);
      return () => clearInterval(checkInterval.current);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      localStorage.setItem('pilot_v8_data', JSON.stringify(channels));
    }
  }, [channels]);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const checkLocalSchedules = () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    setChannels(prev => {
      let hasUpdate = false;
      const next = prev.map(chan => {
        if (chan.schedule?.autoEnabled && chan.auth && chan.status !== 'running') {
          const isToday = chan.schedule.activeDays.includes(currentDay);
          const isTime = chan.schedule.time === currentTime;
          const coolDown = 50 * 60 * 1000;
          const isCooledDown = !chan.lastRunTime || (Date.now() - chan.lastRunTime > coolDown);

          if (isToday && isTime && isCooledDown) {
            handleManualRun(chan);
            hasUpdate = true;
          }
        }
        return chan;
      });
      return hasUpdate ? next : prev;
    });
  };

  const handleManualRun = async (channel: ChannelConfig) => {
     addLog(`[手動啟動] 正在執行 「${channel.name}」 的 AI 流程...`);
     updateChannelInState(channel.id, { status: 'running', lastLog: '正在產出內容...' });
     
     try {
       const res = await fetch('/api/pipeline', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ stage: 'analyze', channel })
       });
       const data = await res.json();
       if (!data.success) throw new Error(data.error);
       addLog(`[成功] 「${channel.name}」流程已交由後端處理。`);
     } catch (e: any) {
       addLog(`[錯誤] ${channel.name}: ${e.message}`);
       updateChannelInState(channel.id, { status: 'error', lastLog: e.message });
     }
  };

  const updateChannelInState = async (id: string, updates: Partial<ChannelConfig>) => {
    if (isFirebaseConfigured && db) {
      const ref = doc(db, "channels", id);
      await updateDoc(ref, updates);
    } else {
      setChannels(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
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
    
    const channelData: ChannelConfig = {
      ...(existing || { auth: null, status: 'idle', step: 0 }),
      id,
      name: form.name || '未命名頻道',
      niche: form.niche,
      language: form.language,
      schedule: form.schedule,
    };

    if (isFirebaseConfigured && db) {
      setIsSyncing(true);
      await setDoc(doc(db, "channels", id), channelData, { merge: true });
      setIsSyncing(false);
      addLog(`[同步] 「${channelData.name}」設定已更新至雲端。`);
    } else {
      if (editingId) {
        setChannels(channels.map(c => c.id === id ? channelData : c));
      } else {
        setChannels([...channels, channelData]);
      }
      addLog(`[更新] 「${channelData.name}」本地設定已更新。`);
    }
    setIsModalOpen(false);
  };

  const handleForceStop = async (channel: ChannelConfig) => {
    if (confirm(`確定要強制停止「${channel.name}」並重置狀態嗎？`)) {
      await updateChannelInState(channel.id, { status: 'idle', lastLog: '已重置。' });
      addLog(`[重置] 「${channel.name}」已重置為閒置狀態。`);
    }
  };

  const deleteChannel = async (id: string) => {
    if (confirm("確定要刪除此頻道嗎？此動作無法復原。")) {
      if (isFirebaseConfigured && db) {
        // Firebase 刪除邏輯略
      }
      setChannels(channels.filter(c => c.id !== id));
      addLog("[刪除] 頻道已移除。");
    }
  };

  const toggleDay = (day: number) => {
    const days = form.schedule.activeDays.includes(day)
      ? form.schedule.activeDays.filter(d => d !== day)
      : [...form.schedule.activeDays, day].sort();
    setForm({ ...form, schedule: { ...form.schedule, activeDays: days } });
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col font-sans">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/40 backdrop-blur-2xl sticky top-0 z-50 flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center font-black italic shadow-2xl rotate-3">S</div>
          <div>
            <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500 text-xs">v8.1</span></h1>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isFirebaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isFirebaseConfigured ? 'text-emerald-500' : 'text-amber-500'}`}>
                {isFirebaseConfigured ? 'Cloud Sync Active' : 'Local Preview Only'}
              </span>
            </div>
          </div>
        </div>
        <button onClick={() => openModal()} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black transition-all shadow-xl shadow-indigo-900/40 hover:-translate-y-0.5 active:translate-y-0 text-sm">
          + 新增頻道設定
        </button>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-8 overflow-y-auto bg-grid-slate-900/[0.04]">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.length === 0 && (
              <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[3rem] opacity-50">
                <p className="text-slate-500 font-bold">目前沒有任何頻道設定，請點擊右上角新增。</p>
              </div>
            )}
            
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group hover:border-indigo-500/40 transition-all duration-500">
                {/* Status Badges */}
                <div className="absolute top-0 right-0 p-6 flex gap-2">
                  {c.status === 'running' && (
                    <button onClick={() => handleForceStop(c)} className="px-4 py-1.5 bg-rose-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-900/20">
                      強制停止
                    </button>
                  )}
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${isFirebaseConfigured ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                    {isFirebaseConfigured ? '✓ Cloud Sync' : 'Offline'}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div className="flex-1 space-y-4">
                    <div>
                      <h2 className="text-3xl font-black text-white mb-1 group-hover:text-indigo-400 transition-colors">{c.name}</h2>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.niche}</span>
                        <span className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.language === 'en' ? 'English' : '繁體中文'}</span>
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
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Time</span>
                        <span className="font-mono font-black text-white">{c.schedule?.time}</span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                       <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 opacity-50">最新動態</p>
                       <p className={`text-sm font-bold ${c.status === 'running' ? 'text-indigo-400 animate-pulse' : c.status === 'error' ? 'text-rose-400' : 'text-slate-300'}`}>
                         {c.lastLog || '等待任務觸發...'}
                       </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 min-w-[180px]">
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black transition-all shadow-xl shadow-amber-900/30">連結 YouTube</button>
                    ) : (
                      <button disabled={c.status === 'running'} onClick={() => handleManualRun(c)} className={`w-full py-4 rounded-2xl font-black transition-all shadow-xl ${c.status === 'running' ? 'bg-slate-800 text-slate-600' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40 hover:-translate-y-0.5'}`}>
                        {c.status === 'running' ? '處理中...' : '立即手動發布'}
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => openModal(c)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-all">
                        ⚙️ 編輯設定
                      </button>
                      <button onClick={() => deleteChannel(c.id)} className="p-3 bg-slate-800 hover:bg-rose-900/40 hover:text-rose-500 text-slate-500 rounded-xl transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-[#020617] p-8 flex flex-col shadow-2xl z-10">
          <div className="mb-8">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4">系統即時紀錄</h3>
            <div className="h-full max-h-[400px] lg:max-h-none overflow-y-auto space-y-3 font-mono text-[10px]">
              {globalLog.map((log, i) => (
                <div key={i} className={`p-3 rounded-xl border leading-relaxed ${log.includes('成功') ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : log.includes('錯誤') || log.includes('重置') ? 'bg-rose-950/20 text-rose-400 border-rose-900/30' : 'bg-slate-900/50 text-slate-500 border-slate-800'}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* 整合後的 編輯/新增 彈窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 z-[100] animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[3rem] p-10 shadow-2xl shadow-indigo-900/20 animate-slide-down">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-white italic uppercase">{editingId ? '編輯頻道設定' : '新增自動化頻道'}</h2>
              {isSyncing && <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>}
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">頻道識別名稱</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="例如：生活科普頻道" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">內容主軸 (Niche)</label>
                  <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={form.niche} onChange={e => setForm({...form, niche: e.target.value})} placeholder="例如：AI、冷知識、美食" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">發片語言</label>
                <div className="flex gap-2">
                  {[ {l:'zh-TW', n:'繁體中文'}, {l:'en', n:'English'} ].map(opt => (
                    <button key={opt.l} onClick={() => setForm({...form, language: opt.l as any})} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${form.language === opt.l ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
                      {opt.n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">自動排程 (星期)</label>
                <div className="flex justify-between gap-1.5">
                  {['日','一','二','三','四','五','六'].map((name, i) => (
                    <button key={i} onClick={() => toggleDay(i)} className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${form.schedule.activeDays.includes(i) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">每日發布時間</label>
                  <input type="time" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all" value={form.schedule.time} onChange={e => setForm({...form, schedule: {...form.schedule, time: e.target.value}})} />
                </div>
                <div className="flex items-end">
                   <button onClick={saveChannel} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 transition-all text-sm">
                     {editingId ? '儲存更新' : '確認建立'}
                   </button>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-full py-2 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:text-slate-400 transition-colors">
                取消回首頁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
