
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, ScheduleConfig, SystemStatus } from './types';
import { db, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

  // Fix: Implemented addLog to resolve "Cannot find name 'addLog'" errors
  const addLog = (msg: string) => {
    setGlobalLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  // Fix: Implemented handleAuthCallback to resolve "Cannot find name 'handleAuthCallback'" error
  const handleAuthCallback = async (code: string) => {
    addLog("正在交換授權碼...");
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        addLog("✅ 授權成功！");
        window.history.replaceState({}, document.title, "/");
      } else {
        addLog(`❌ 授權失敗: ${data.error}`);
      }
    } catch (e: any) {
      addLog(`❌ 授權連線錯誤: ${e.message}`);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) handleAuthCallback(code);

    if (isFirebaseConfigured && db) {
      addLog("系統模式：Firebase 雲端連動。");
      
      // 監聽全局引擎狀態
      onSnapshot(doc(db, "system", "status"), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const lastHeartbeat = data.lastHeartbeat?.toMillis ? data.lastHeartbeat.toMillis() : (data.lastHeartbeat || 0);
          setSystemStatus({
            ...data,
            lastHeartbeat
          } as SystemStatus);
        }
      });

      // 監聽頻道列表
      const q = query(collection(db, "channels"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ ...doc.data() as ChannelConfig, id: doc.id }));
        setChannels(docs);
      });
      return () => unsubscribe();
    } else {
      addLog("系統模式：本地預覽（無雲端功能）。");
      const saved = localStorage.getItem('pilot_v8_data');
      if (saved) setChannels(JSON.parse(saved));
    }
  }, []);

  const testCronApi = async () => {
    addLog("🔍 正在診斷：嘗試手動打擊 Vercel Cron API...");
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      if (data.success) {
        addLog(`✅ API 回應成功！當前巡邏時間: ${data.pulse || '未知'}`);
      } else {
        addLog(`❌ API 邏輯錯誤: ${data.error}`);
      }
    } catch (e: any) {
      addLog(`❌ API 連線失敗: ${e.message}。請確認 Vercel 部署是否成功。`);
    }
  };

  const forceResetHeartbeat = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      addLog("正在重置雲端心跳狀態...");
      const statusRef = doc(db, "system", "status");
      await setDoc(statusRef, {
        lastHeartbeat: serverTimestamp(),
        engineStatus: 'online',
        source: 'Manual-Repair'
      }, { merge: true });
      addLog("✅ 重置成功。");
    } catch (e: any) {
      addLog(`❌ 重置失敗: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-600">
              Pilot V8: AI Shorts Engine
            </h1>
            <p className="text-slate-500 mt-2">全自動化 YouTube 短影音生成與發布中心</p>
          </div>
          <div className="flex gap-4">
            <button onClick={testCronApi} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors">
              API 診斷
            </button>
            <button onClick={forceResetHeartbeat} disabled={isSyncing} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors">
              引擎重置
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-bold border-l-4 border-blue-500 pl-3">頻道監控狀態</h2>
            {channels.length === 0 ? (
              <div className="p-12 text-center bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                <p className="text-slate-500">尚無監控中的頻道</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {channels.map(chan => (
                  <div key={chan.id} className="p-4 bg-slate-800 border border-slate-700 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold">{chan.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${chan.status === 'success' ? 'bg-green-900 text-green-300' : chan.status === 'running' ? 'bg-blue-900 text-blue-300 animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
                        {chan.status ? chan.status.toUpperCase() : 'IDLE'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">{chan.niche} • {chan.language}</p>
                    <div className="text-[10px] font-mono bg-slate-900 p-2 rounded text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">
                      {chan.lastLog || '等待任務啟動...'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-6">
             <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">系統診斷</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">引擎連線狀態</span>
                    <span className={`w-3 h-3 rounded-full ${systemStatus?.engineStatus === 'online' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">最後心跳</span>
                    <span className="font-mono">{systemStatus?.lastHeartbeat ? new Date(systemStatus.lastHeartbeat).toLocaleTimeString() : '---'}</span>
                  </div>
                </div>
             </div>

             <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">實時系統日誌</h3>
                <div className="h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
                  {globalLog.map((log, i) => (
                    <div key={i} className="text-[10px] font-mono text-slate-400 border-l border-slate-800 pl-2">
                      {log}
                    </div>
                  ))}
                  {globalLog.length === 0 && <div className="text-[10px] text-slate-600 italic">無活動紀錄</div>}
                </div>
             </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

// Fix: Exported App component as default to resolve "no default export" error in index.tsx
export default App;
