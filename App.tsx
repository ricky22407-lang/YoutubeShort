
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig } from './types';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "..." ,
  appId: "..."
};

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEngineActive, setIsEngineActive] = useState(false);
  const [wakeLockStatus, setWakeLockStatus] = useState<'locked' | 'unlocked' | 'unsupported'>('unlocked');
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'disconnected'>('disconnected');
  
  // 新增：追蹤目前是否有任何頻道正在渲染 (Veo 限制)
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);
  const dbRef = useRef<any>(null);

  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 30));

  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    autoDeploy: false, nextRun: ''
  });

  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      dbRef.current = getDatabase(app);
      setCloudStatus('connected');
      
      const triggerRef = ref(dbRef.current, 'system/trigger_check');
      onValue(triggerRef, (snapshot) => {
        if (isEngineActive) {
          addLog("📡 雲端信號喚醒，掃描排程...");
          checkSchedules();
        }
      });
    } catch (e) {
      console.error("Firebase Init Failed", e);
    }
  }, [isEngineActive]);

  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockStatus('locked');
      } catch (err) { setWakeLockStatus('unsupported'); }
    }
  };

  const toggleEngine = async () => {
    const newStatus = !isEngineActive;
    setIsEngineActive(newStatus);
    if (newStatus) {
      if (audioRef.current) audioRef.current.play().catch(() => {});
      await requestWakeLock();
      addLog("🚀 引擎點火");
    } else {
      if (audioRef.current) audioRef.current.pause();
      if (wakeLockRef.current) wakeLockRef.current.release();
      addLog("🛑 引擎停機");
    }
  };

  const checkSchedules = () => {
    const now = new Date();
    // 只有在當前沒有其他渲染任務時才發起新任務，避免衝撞 429
    if (isAnyChannelRendering) {
      addLog("⏳ 目前已有頻道正在渲染，排程任務延後等待中...");
      return;
    }

    channels.forEach(async (channel) => {
      if (channel.autoDeploy && channel.nextRun && channel.status !== 'running') {
        const scheduleTime = new Date(channel.nextRun);
        if (now >= scheduleTime && (now.getTime() - scheduleTime.getTime()) < 600000) {
          addLog(`⏰ 觸發: ${channel.name}`);
          await runPipeline(channel);
        }
      }
    });

    if (dbRef.current) {
      set(ref(dbRef.current, 'system/last_pulse'), {
        timestamp: serverTimestamp(),
        active_channels: channels.length,
        status: isAnyChannelRendering ? 'rendering' : 'pulsing'
      });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (isEngineActive) checkSchedules();
    }, 60000); 
    return () => clearInterval(interval);
  }, [channels, isEngineActive, isAnyChannelRendering]);

  const runPipeline = async (channel: ChannelConfig) => {
    if (channel.status === 'running' || isAnyChannelRendering) return;
    
    setIsAnyChannelRendering(true);
    const update = (up: Partial<ChannelConfig>) => {
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    update({ status: 'running', step: 10, lastLog: '分析趨勢中...' });

    try {
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);

      update({ step: 40, lastLog: 'Veo 渲染中 (約需 3-5 分鐘)...' });

      const r2 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata })
      });
      const d2 = await r2.json();
      
      if (!d2.success) {
        if (d2.isQuotaError) {
          addLog("⚠️ API 額度警告：Veo RPM 已滿，一分鐘後自動重試...");
          update({ lastLog: 'API 額度滿載，排隊重試中...', step: 30 });
          await new Promise(r => setTimeout(r, 65000));
          setIsAnyChannelRendering(false);
          return runPipeline(channel); // 重試
        }
        throw new Error(d2.error);
      }

      let nextRun = channel.nextRun;
      if (channel.autoDeploy && nextRun) {
        const d = new Date(nextRun);
        d.setDate(d.getDate() + 1);
        nextRun = d.toISOString();
      }

      update({ 
        status: 'success', step: 100, 
        lastLog: `完成: ${d2.videoId}`,
        lastRun: new Date().toISOString(),
        nextRun
      });
      addLog(`✅ ${channel.name} 發布完成`);
    } catch (e: any) {
      update({ status: 'error', lastLog: `${e.message}`, step: 0 });
      addLog(`❌ 失敗: ${e.message}`);
    } finally {
      setIsAnyChannelRendering(false);
    }
  };

  const saveChannel = () => {
    if (!newChan.name) return;
    if (editingId) {
      setChannels(channels.map(c => c.id === editingId ? { ...c, ...newChan } : c));
    } else {
      const c: ChannelConfig = {
        id: Math.random().toString(36).substr(2, 9), ...newChan,
        auth: null, status: 'idle', step: 0
      };
      setChannels([...channels, c]);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white font-sans selection:bg-cyan-500">
      <audio ref={audioRef} loop src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=" />

      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black italic text-black text-xl">S</div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-none">ShortsPilot <span className="text-zinc-600">ONYX</span></h1>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${cloudStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Firebase {cloudStatus}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isEngineActive ? 'bg-cyan-500 animate-pulse' : 'bg-zinc-800'}`}></span>
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Engine {isEngineActive ? 'Active' : 'Standby'}</span>
              </div>
              {isAnyChannelRendering && (
                <div className="flex items-center gap-1.5 bg-yellow-500/10 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></span>
                  <span className="text-[8px] font-black uppercase text-yellow-500 tracking-widest">Veo API Occupied</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={toggleEngine} className={`px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border transition-all ${isEngineActive ? 'border-cyan-500 text-cyan-500 bg-cyan-500/10' : 'border-zinc-800 text-zinc-600'}`}>
            {isEngineActive ? 'Disable Engine' : 'Ignite Engine'}
          </button>
          <button onClick={() => { setIsModalOpen(true); setEditingId(null); }} className="px-10 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:invert transition-all">
            Init Core
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-10 overflow-y-auto bg-zinc-950/30">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className={`bg-zinc-950 border rounded-[2.5rem] p-8 transition-all ${c.status === 'running' ? 'border-cyan-500 ring-1 ring-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)]' : 'border-zinc-900'}`}>
                <div className="flex justify-between items-center">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-black italic uppercase tracking-tight">{c.name}</h2>
                      {c.autoDeploy && <span className="bg-cyan-500 text-black text-[8px] font-black px-2 py-0.5 rounded uppercase">Auto</span>}
                    </div>
                    <div className="flex gap-2 text-[9px] font-bold text-zinc-500">
                      <span className="border border-zinc-800 px-2 py-1 rounded">{c.niche}</span>
                      {c.nextRun && <span className="border border-zinc-800 px-2 py-1 rounded text-cyan-500">Next: {new Date(c.nextRun).toLocaleTimeString()}</span>}
                    </div>
                    <p className={`text-[11px] font-bold ${c.status === 'error' ? 'text-red-500' : 'text-zinc-600'}`}>{c.lastLog || 'System Ready'}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setEditingId(c.id); setIsModalOpen(true); }} className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-900 text-zinc-600 hover:text-white transition-colors">✎</button>
                    {/* Fix: Simplified disabled logic to resolve TypeScript narrowing redundancy error */}
                    <button 
                      disabled={c.status === 'running' || isAnyChannelRendering} 
                      onClick={() => runPipeline(c)} 
                      className={`px-10 py-4 rounded-2xl font-black text-[10px] uppercase transition-all ${c.status === 'running' ? 'bg-zinc-800 text-zinc-600' : isAnyChannelRendering ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed' : 'bg-white text-black hover:scale-105'}`}
                    >
                      {c.status === 'running' ? 'Rendering...' : isAnyChannelRendering ? 'Queueing' : 'Deploy'}
                    </button>
                  </div>
                </div>
                {c.status === 'running' && (
                  <div className="mt-6 space-y-2">
                    <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all duration-1000" style={{ width: `${c.step}%` }}></div>
                    </div>
                    <p className="text-[8px] text-zinc-700 uppercase font-black tracking-widest text-right animate-pulse">Veo 3.1 Neural Rendering active...</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-[400px] border-l border-zinc-900 bg-black flex flex-col p-10">
          <div className="space-y-6">
            <div className="p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
              <h4 className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-2">Quota Guard Active</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Veo 3.1 預覽版目前限制 3 RPM。系統已啟動「全域渲染鎖定」，確保多個頻道不會同時發起 API 請求，並將輪詢間隔延長至 30 秒。
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-[9px] font-black text-zinc-700 uppercase tracking-[0.3em] text-center">Engine Logs</h3>
              <div className="space-y-3 font-mono text-[9px]">
                {globalLog.map((log, i) => (
                  <div key={i} className={`p-4 rounded-xl border border-zinc-900 bg-zinc-950/50 ${log.includes('✅') ? 'text-cyan-400 border-cyan-900/20' : log.includes('❌') ? 'text-red-400' : log.includes('⚠️') ? 'text-yellow-500 border-yellow-900/20' : 'text-zinc-600'}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-8 z-[100]">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-lg rounded-[3rem] p-12 space-y-8">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">Core Config</h2>
            <div className="space-y-4">
              <input className="w-full bg-zinc-900 border-none rounded-2xl p-5 text-sm font-bold text-white outline-none" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} placeholder="Channel Name" />
              <input className="w-full bg-zinc-900 border-none rounded-2xl p-5 text-sm font-bold text-white outline-none" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} placeholder="Niche" />
              <div className="p-6 bg-zinc-900 rounded-[2rem] space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-zinc-500">Auto-Pilot</span>
                  <button onClick={() => setNewChan({...newChan, autoDeploy: !newChan.autoDeploy})} className={`w-12 h-6 rounded-full relative transition-all ${newChan.autoDeploy ? 'bg-cyan-500' : 'bg-zinc-800'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newChan.autoDeploy ? 'right-1' : 'left-1'}`}></div>
                  </button>
                </div>
                {newChan.autoDeploy && (
                  <input type="datetime-local" className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-xs font-bold text-white" value={newChan.nextRun} onChange={e => setNewChan({...newChan, nextRun: e.target.value})} />
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-zinc-600 font-black uppercase text-[10px]">Cancel</button>
              <button onClick={saveChannel} className="flex-1 py-5 bg-white text-black rounded-2xl font-black uppercase text-[10px] shadow-xl hover:invert transition-all">Sync</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
