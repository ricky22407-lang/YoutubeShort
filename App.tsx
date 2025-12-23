
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
  const [channels, setChannels] = useState<any[]>([]);
  const channelsRef = useRef<any[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [isEngineActive, setIsEngineActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const isRenderingRef = useRef(false);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  const abortControllers = useRef<Record<string, AbortController>>({});
  
  const [globalLog, setGlobalLog] = useState<string[]>([]);

  // Added state for mandatory API key selection (required for Veo models)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Check if an API key has been selected on mount as per mandatory Veo guidelines
  useEffect(() => {
    const checkKey = async () => {
      const win = window as any;
      if (win.aistudio && typeof win.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Assume key is present if the selection utility is missing in this context
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  // Handle the selection of a paid API key via the mandatory dialog
  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio && typeof win.aistudio.openSelectKey === 'function') {
      await win.aistudio.openSelectKey();
      // Per guidelines, assume successful selection after triggering dialog to avoid race conditions
      setHasApiKey(true);
    }
  };

  const addLog = (msg: string) => {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    setGlobalLog(p => [`[${ts}] ${msg}`, ...p].slice(0, 50));
  };

  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  const setRenderingState = (val: boolean) => {
    isRenderingRef.current = val;
    setIsAnyChannelRendering(val);
  };

  const updateChannel = (id: string, up: any) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  // 全自動 Pipeline 邏輯 (包含分析 + 渲染)
  const runPipeline = async (channel: any, slotId?: string) => {
    if (isAnyChannelRendering) return;
    setRenderingState(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    try {
      // 1. 分析
      addLog(`📡 [${channel.name}] 正在分析趨勢...`);
      updateChannel(channel.id, { status: 'running', step: 5, lastLog: '正在分析趨勢...', lastTriggeredSlot: slotId });
      
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(`分析失敗: ${d1.error}`);
      
      // 重要：持久化劇本 (Metadata)
      addLog(`✅ [${channel.name}] 劇本已存檔 (避免 429 需重算)`);
      updateChannel(channel.id, { pendingMetadata: d1.metadata, step: 20 });

      // 2. 初始安全冷卻
      await sleep(15000, controller.signal);

      // 3. 轉交渲染邏輯
      await executeRender(channel.id, d1.metadata, controller.signal);

    } catch (e: any) {
      if (e.name === 'AbortError') return;
      addLog(`❌ [${channel.name}] 失敗: ${e.message}`);
      updateChannel(channel.id, { status: 'error', lastLog: e.message });
    } finally {
      setRenderingState(false);
    }
  };

  // 核心渲染邏輯 (可獨立被呼叫，用於斷點重試)
  const executeRender = async (channelId: string, metadata: any, signal: AbortSignal) => {
    let renderAttempts = 0;
    const MAX_RETRIES = 3;
    const channel = channelsRef.current.find(c => c.id === channelId);

    while (renderAttempts < MAX_RETRIES) {
      if (signal.aborted) return;
      addLog(`🎥 [${channel.name}] 發送 Veo 生成請求 (嘗試 ${renderAttempts + 1}/3)...`);
      updateChannel(channelId, { status: 'running', step: 40, lastLog: `Veo 渲染中 (嘗試 ${renderAttempts + 1})...` });

      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata }),
        signal
      });
      const data = await res.json();

      if (data.success) {
        addLog(`🎉 [${channel.name}] 任務圓滿成功! ID: ${data.videoId}`);
        updateChannel(channelId, { status: 'success', step: 100, lastLog: `發布成功 ID: ${data.videoId}`, pendingMetadata: null, lastRun: new Date().toISOString() });
        return;
      }

      if (data.isQuotaError) {
        renderAttempts++;
        if (renderAttempts < MAX_RETRIES) {
          addLog(`⏳ [${channel.name}] 配額已滿。等待 60 秒後進行 ${renderAttempts + 1} 次重試...`);
          for (let s = 60; s > 0; s--) {
            if (signal.aborted) return;
            updateChannel(channelId, { lastLog: `配額超限！${s}s 後重試...` });
            await sleep(1000, signal);
          }
          continue;
        }
        throw new Error(`今日 API 渲染配額已完全耗盡。劇本已保留，請稍後再試。`);
      }

      throw new Error(`渲染錯誤: ${data.error}`);
    }
  };

  // 斷點重試渲染功能
  const retryPendingRender = async (channel: any) => {
    if (isAnyChannelRendering || !channel.pendingMetadata) return;
    setRenderingState(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;
    addLog(`🔄 [${channel.name}] 正在利用存檔劇本重新嘗試渲染...`);
    try {
      await executeRender(channel.id, channel.pendingMetadata, controller.signal);
    } catch (e: any) {
      addLog(`❌ [${channel.name}] 重試失敗: ${e.message}`);
      updateChannel(channel.id, { status: 'error', lastLog: e.message });
    } finally {
      setRenderingState(false);
    }
  };

  const abortPipeline = (id: string) => {
    if (abortControllers.current[id]) abortControllers.current[id].abort();
    updateChannel(id, { status: 'idle', lastLog: '已重置', step: 0 });
    setRenderingState(false);
  };

  // Mandatory block for API key selection if using Veo models
  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="bg-zinc-950 border border-zinc-900 p-12 rounded-[3rem] text-center space-y-8 max-w-md shadow-[0_0_100px_rgba(0,0,0,1)]">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter">API Key Required</h2>
          <p className="text-zinc-500 text-sm font-bold leading-relaxed">
            This application uses Veo for high-quality video generation. You must select a paid API key from a billing-enabled GCP project to continue.
          </p>
          <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest underline hover:text-cyan-500 transition-colors">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">
              View Billing Documentation
            </a>
          </div>
          <button 
            onClick={handleSelectKey}
            className="w-full py-6 bg-white text-black rounded-3xl font-black uppercase text-[11px] hover:invert transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center font-black italic text-black shadow-[0_0_30px_rgba(255,255,255,0.2)]">S</div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">ShortsPilot <span className="text-zinc-600">ONYX v8.2</span></h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsEngineActive(!isEngineActive)} className={`px-8 py-3 rounded-full font-black text-[10px] uppercase border transition-all ${isEngineActive ? 'border-cyan-500 text-cyan-500 bg-cyan-500/10' : 'border-zinc-800 text-zinc-600'}`}>
            {isEngineActive ? 'AUTO ON' : 'AUTO OFF'}
          </button>
          {/* Fix: Line 182 - Replaced void return in logical expression with a proper block statement */}
          <button onClick={() => { setEditingId(null); setIsModalOpen(true); }} className="px-10 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase">Init Core</button>
        </div>
      </nav>

      <main className="flex-1 p-10 flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-6 max-w-4xl mx-auto w-full">
          {channels.length === 0 && <div className="text-center py-20 border border-zinc-900 rounded-[3rem] text-zinc-700 uppercase font-black text-xs italic">System Clear. No active cores.</div>}
          {channels.map(c => (
            <div key={c.id} className={`bg-zinc-950 border rounded-[3rem] p-10 transition-all ${c.status === 'running' ? 'border-cyan-500' : 'border-zinc-900'}`}>
              <div className="flex justify-between items-start">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter">{c.name}</h2>
                    <span className="text-[10px] font-black px-3 py-1 bg-zinc-900 rounded-full text-zinc-500 border border-zinc-800 tracking-widest">{c.niche}</span>
                  </div>
                  <p className={`text-xs font-bold leading-relaxed ${c.status === 'error' ? 'text-red-500/80' : 'text-zinc-500'}`}>
                    {c.lastLog || 'Ready for instruction.'}
                    {c.pendingMetadata && <span className="block mt-2 text-cyan-500 font-black tracking-widest text-[9px]">🎞️ 劇本存檔已鎖定: {c.pendingMetadata.title}</span>}
                  </p>
                </div>
                
                <div className="flex gap-4">
                  {c.status === 'running' ? (
                    <button onClick={() => abortPipeline(c.id)} className="px-10 py-5 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-red-500/20">Kill</button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button disabled={isAnyChannelRendering} onClick={() => runPipeline(c)} className={`px-12 py-5 rounded-2xl font-black text-[10px] uppercase transition-all ${isAnyChannelRendering ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-black hover:invert'}`}>
                        Launch Full
                      </button>
                      {c.pendingMetadata && (
                        <button disabled={isAnyChannelRendering} onClick={() => retryPendingRender(c)} className="px-12 py-3 bg-cyan-500 text-black rounded-xl font-black text-[9px] uppercase hover:bg-cyan-400 transition-all">
                          Retry Render
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {c.status === 'running' && (
                <div className="mt-10 h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all duration-1000" style={{ width: `${c.step}%` }}></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <aside className="w-full lg:w-[400px] flex flex-col gap-8">
          <div className="p-8 bg-zinc-950 border border-zinc-900 rounded-[2.5rem] space-y-6">
            <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Resilience Monitor</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-zinc-600 uppercase tracking-wider">Quota Strategy</span>
                <span className="text-green-500">RESUME-ON-429</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-zinc-600 uppercase tracking-wider">Last Sync</span>
                <span className="text-zinc-400">SUCCESSFUL</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8">
            <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.4em] text-center italic mb-6">Trace Log</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {globalLog.map((log, i) => (
                <div key={i} className={`p-4 rounded-2xl border bg-black/40 text-[10px] font-mono leading-relaxed ${log.includes('✅') || log.includes('🎉') ? 'text-cyan-400 border-cyan-900/20' : log.includes('❌') ? 'text-red-400 border-red-900/20' : log.includes('⏳') ? 'text-yellow-500 border-yellow-900/20' : 'text-zinc-500 border-zinc-900'}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Simplified Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8 z-[100]">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-xl rounded-[3rem] p-12 space-y-10 shadow-[0_0_100px_rgba(0,0,0,1)]">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase">Core Config</h2>
            <div className="space-y-6">
              <input className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500" placeholder="CHANNEL NAME" value={editingId ? channels.find(c => c.id === editingId)?.name : ''} onChange={e => {}} />
              <input className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500" placeholder="NICHE" value={editingId ? channels.find(c => c.id === editingId)?.niche : ''} onChange={e => {}} />
            </div>
            <div className="flex gap-6">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-6 text-zinc-600 font-black uppercase text-[11px]">Discard</button>
              <button onClick={() => {
                const id = Math.random().toString(36).substr(2, 9);
                setChannels([...channels, { id, name: '新頻道', niche: 'AI 科技', status: 'idle', step: 0, pendingMetadata: null }]);
                setIsModalOpen(false);
              }} className="flex-1 py-6 bg-white text-black rounded-3xl font-black uppercase text-[11px]">Deploy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
