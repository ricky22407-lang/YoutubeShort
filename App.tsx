
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

const DAYS_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const sleep = (ms: number, signal?: AbortSignal) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
};

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const channelsRef = useRef<ChannelConfig[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [isEngineActive, setIsEngineActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const isRenderingRef = useRef(false);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  const abortControllers = useRef<Record<string, AbortController>>({});
  
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const addLog = (msg: string) => {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    setGlobalLog(p => [`[${ts}] ${msg}`, ...p].slice(0, 50));
  };

  const [newChan, setNewChan] = useState({ 
    name: '', niche: 'AI 科技', language: 'zh-TW' as 'zh-TW' | 'en',
    autoDeploy: false, weeklySchedule: { days: [] as number[], times: ['', '', ''] as string[] }
  });

  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  useEffect(() => {
    let timer: any;
    if (isEngineActive) {
      addLog("🚀 自動掃描排程已啟動...");
      checkSchedules();
      timer = setInterval(() => checkSchedules(), 30000);
    }
    return () => clearInterval(timer);
  }, [isEngineActive]);

  const setRenderingState = (val: boolean) => {
    isRenderingRef.current = val;
    setIsAnyChannelRendering(val);
  };

  const systemPurge = () => {
    if (!window.confirm("確定執行「系統淨化」嗎？")) return;
    if (window.prompt("請輸入「PURGE」：") !== "PURGE") return;
    Object.values(abortControllers.current).forEach(ctrl => ctrl.abort());
    localStorage.removeItem('pilot_onyx_v8_data');
    setChannels([]);
    setIsEngineActive(false);
    setRenderingState(false);
    addLog("🛡️ 核心重置完成");
  };

  const checkSchedules = () => {
    if (isRenderingRef.current) return;
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const channel of channelsRef.current) {
      if (!channel.autoDeploy || channel.status === 'running') continue;
      const slotId = `${currentDay}_${currentTime}`;
      if (channel.weeklySchedule?.days.includes(currentDay) && channel.weeklySchedule?.times.includes(currentTime)) {
        if (channel.lastTriggeredSlot !== slotId) {
          runPipeline(channel, slotId);
          break;
        }
      }
    }
  };

  const runPipeline = async (channel: ChannelConfig, slotId?: string) => {
    if (isRenderingRef.current) return;
    setRenderingState(true);
    
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    const update = (up: Partial<ChannelConfig>) => {
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    try {
      // Step 1: 分析
      addLog(`📡 [${channel.name}] 正在獲取趨勢指令 (Flash)...`);
      update({ status: 'running', step: 5, lastLog: '分析趨勢中...', lastTriggeredSlot: slotId });
      
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(`分析失敗 @ ${d1.at}: ${d1.error}`);
      addLog(`✅ [${channel.name}] 趨勢解析完畢`);

      // Step 2: 深度冷卻 (提升到 40 秒，並確保與分析任務完全脫鉤)
      const COOL_DOWN = 40;
      for (let i = COOL_DOWN; i > 0; i--) {
        if (controller.signal.aborted) return;
        update({ step: 10 + ((COOL_DOWN - i) * 1.5), lastLog: `API 預熱緩衝中 (${i}s)...` });
        if (i % 10 === 0) addLog(`⏳ [${channel.name}] 等待配額窗口冷卻... ${i}s`);
        await sleep(1000, controller.signal);
      }

      // Step 3: 渲染 (具備自動重試機制)
      let renderAttempts = 0;
      const MAX_RETRIES = 3;
      let d2: any;

      while (renderAttempts < MAX_RETRIES) {
        if (controller.signal.aborted) return;
        addLog(`🎥 [${channel.name}] 嘗試請求 Veo 生成 (第 ${renderAttempts + 1} 次)...`);
        update({ step: 40, lastLog: `發送 Veo 請求 (嘗試 ${renderAttempts + 1})...` });

        const r2 = await fetch('/api/pipeline', {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata }),
          signal: controller.signal
        });
        d2 = await r2.json();

        if (d2.success) break; // 成功就跳出循環

        if (d2.isQuotaError) {
          renderAttempts++;
          if (renderAttempts < MAX_RETRIES) {
            addLog(`⚠️ [${channel.name}] 觸發 429 限制。啟動「指數退避」重試，將睡眠 60 秒...`);
            for (let s = 60; s > 0; s--) {
              if (controller.signal.aborted) return;
              update({ lastLog: `配額超限！${s}s 後重試...` });
              await sleep(1000, controller.signal);
            }
            continue; // 繼續下一次 while 循環
          }
        }
        
        // 如果不是 429 或已經超過重試次數，直接噴錯
        throw new Error(`渲染失敗 @ ${d2.at}: ${d2.error}`);
      }

      update({ status: 'success', step: 100, lastLog: `發布成功 ID: ${d2.videoId}`, lastRun: new Date().toISOString() });
      addLog(`🎉 [${channel.name}] 任務達成！影片 ID: ${d2.videoId}`);

    } catch (e: any) {
      if (e.name === 'AbortError') return;
      update({ status: 'error', lastLog: e.message, step: 0 });
      addLog(`❌ [${channel.name}] 失敗報錯: ${e.message}`);
    } finally {
      addLog("🛡️ 執行安全冷卻鎖定 (30s)...");
      await sleep(30000); 
      setRenderingState(false);
      delete abortControllers.current[channel.id];
    }
  };

  const abortPipeline = (id: string) => {
    if (abortControllers.current[id]) abortControllers.current[id].abort();
    setChannels(p => p.map(c => c.id === id ? { ...c, status: 'idle', lastLog: '已強制重置', step: 0 } : c));
    setRenderingState(false);
    addLog(`⚡ 手動強制中斷核心: ${id}`);
  };

  const openEditModal = (c?: ChannelConfig) => {
    if (c) {
      setEditingId(c.id);
      setNewChan({ name: c.name, niche: c.niche, language: c.language || 'zh-TW', autoDeploy: c.autoDeploy, weeklySchedule: c.weeklySchedule || { days: [], times: ['', '', ''] } });
    } else {
      setEditingId(null);
      setNewChan({ name: '', niche: 'AI 科技', language: 'zh-TW', autoDeploy: false, weeklySchedule: { days: [], times: ['', '', ''] } });
    }
    setIsModalOpen(true);
  };

  const saveChannel = () => {
    if (!newChan.name) return;
    const configToSave = { ...newChan, weeklySchedule: { ...newChan.weeklySchedule, times: newChan.weeklySchedule.times.filter(t => t !== '') } };
    if (editingId) setChannels(channels.map(c => c.id === editingId ? { ...c, ...configToSave } : c));
    else setChannels([...channels, { id: Math.random().toString(36).substr(2, 9), status: 'idle', step: 0, auth: null, ...configToSave }]);
    setIsModalOpen(false);
  };

  const toggleDay = (day: number) => {
    const days = [...newChan.weeklySchedule.days];
    const idx = days.indexOf(day);
    if (idx > -1) days.splice(idx, 1); else days.push(day);
    setNewChan({ ...newChan, weeklySchedule: { ...newChan.weeklySchedule, days } });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white font-sans">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black italic text-black text-xl shadow-[0_0_20px_white]">S</div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-zinc-600">ONYX</span></h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`w-2 h-2 rounded-full ${isEngineActive ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`}></span>
              <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Fail-Safe Auto Engine</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={systemPurge} className="px-6 py-3 border border-red-900 text-red-500 rounded-full font-black text-[9px] uppercase hover:bg-red-500/10">Purge</button>
          <button onClick={() => setIsEngineActive(!isEngineActive)} className={`px-8 py-3 rounded-full font-black text-[10px] uppercase border transition-all ${isEngineActive ? 'border-cyan-500 text-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-zinc-800 text-zinc-600'}`}>{isEngineActive ? 'Engine Live' : 'Start Engine'}</button>
          <button onClick={() => openEditModal()} className="px-10 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">Init Core</button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 p-10 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className={`bg-zinc-950 border rounded-[2.5rem] p-8 transition-all ${c.status === 'running' ? 'border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.1)]' : 'border-zinc-900'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-2xl font-black italic uppercase">{c.name}</h2>
                      {c.autoDeploy && <span className="bg-cyan-500 text-black text-[8px] font-black px-3 py-1 rounded-full uppercase">Auto</span>}
                    </div>
                    <div className="flex gap-2">
                      {c.weeklySchedule?.days.map(d => <span key={d} className="bg-zinc-900 text-zinc-500 text-[9px] font-black px-2 py-1 rounded border border-zinc-800">{DAYS_NAME[d]}</span>)}
                      {c.weeklySchedule?.times.map((t, idx) => <span key={idx} className="bg-zinc-900 text-cyan-500/80 text-[9px] font-black px-2 py-1 rounded border border-cyan-900/20">🕒 {t}</span>)}
                    </div>
                    <p className={`text-[11px] font-bold ${c.status === 'error' ? 'text-red-500' : 'text-zinc-600'}`}>{c.lastLog || 'Standby'}</p>
                  </div>
                  <div className="flex gap-4">
                    {c.status !== 'running' && <button onClick={() => openEditModal(c)} className="p-4 bg-zinc-900 text-zinc-600 border border-zinc-800 rounded-xl text-[10px] font-bold uppercase">Edit</button>}
                    {c.status === 'running' ? (
                      <button onClick={() => abortPipeline(c.id)} className="px-10 py-5 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase animate-pulse">Force Kill</button>
                    ) : (
                      <button disabled={isAnyChannelRendering} onClick={() => runPipeline(c)} className={`px-12 py-5 rounded-2xl font-black text-[10px] uppercase transition-all ${isAnyChannelRendering ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-black hover:invert'}`}>{isAnyChannelRendering ? 'Blocked' : 'Launch'}</button>
                    )}
                  </div>
                </div>
                {c.status === 'running' && (
                  <div className="mt-8 space-y-3">
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all duration-1000" style={{ width: `${c.step}%` }}></div>
                    </div>
                    <p className="text-[8px] text-zinc-700 uppercase font-black tracking-widest animate-pulse">Running Intelligent Pipeline...</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-[420px] border-l border-zinc-900 bg-black flex flex-col p-10">
          <div className="space-y-8 h-full flex flex-col">
            <div className="p-8 bg-zinc-950 rounded-[2.5rem] border border-zinc-900 space-y-6">
              <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Resilience Monitor</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-[11px] font-bold"><span className="text-zinc-600">429 Protection</span><span className="text-green-500">AUTO-RETRY ENABLED</span></div>
                <div className="flex justify-between text-[11px] font-bold"><span className="text-zinc-600">Min Backoff</span><span className="text-zinc-400">60.0 SEC</span></div>
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <h3 className="text-[10px] font-black text-zinc-800 uppercase tracking-[0.4em] text-center italic mb-4">Diagnostic Trace</h3>
              <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {globalLog.map((log, i) => (
                  <div key={i} className={`p-4 rounded-[1.2rem] border border-zinc-900 bg-zinc-950/30 text-[10px] font-mono leading-relaxed ${log.includes('✅') || log.includes('🎉') ? 'text-cyan-400 border-cyan-900/10' : log.includes('⚠️') || log.includes('⏳') ? 'text-yellow-500' : log.includes('❌') ? 'text-red-400' : 'text-zinc-500'}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8 z-[100]">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-2xl rounded-[3rem] p-12 space-y-10 overflow-y-auto max-h-[90vh]">
            <h2 className="text-4xl font-black italic uppercase tracking-tighter">Core Config</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-4">Channel Name</label>
                <input className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-cyan-500" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-zinc-600 tracking-widest ml-4">Niche</label>
                <input className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-cyan-500" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
              </div>
            </div>
            <div className="p-8 bg-zinc-900/50 rounded-[2.5rem] space-y-8 border border-zinc-800">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black uppercase italic">Automatic Deployment</h3>
                <button onClick={() => setNewChan({...newChan, autoDeploy: !newChan.autoDeploy})} className={`w-14 h-7 rounded-full relative transition-all ${newChan.autoDeploy ? 'bg-cyan-500' : 'bg-zinc-800'}`}>
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${newChan.autoDeploy ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>
              {newChan.autoDeploy && (
                <div className="space-y-8">
                  <div className="flex justify-between gap-2">
                    {DAYS_NAME.map((name, i) => (
                      <button key={name} onClick={() => toggleDay(i)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border ${newChan.weeklySchedule.days.includes(i) ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-zinc-950 text-zinc-700 border-zinc-900'}`}>{name}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[0, 1, 2].map(idx => (
                      <input key={idx} type="time" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-black text-white outline-none" value={newChan.weeklySchedule.times[idx]} onChange={e => {
                        const times = [...newChan.weeklySchedule.times];
                        times[idx] = e.target.value;
                        setNewChan({...newChan, weeklySchedule: { ...newChan.weeklySchedule, times }});
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-6 pt-4 border-t border-zinc-900">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 text-zinc-600 font-black uppercase text-[11px] tracking-widest">Discard</button>
              <button onClick={saveChannel} className="flex-1 py-6 bg-white text-black rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-2xl hover:bg-cyan-400">Save Core</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
