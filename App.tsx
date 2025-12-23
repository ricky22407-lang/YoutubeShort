
import React, { useState, useEffect, useRef } from 'react';

const App: React.FC = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const channelsRef = useRef<any[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const [isEngineActive, setIsEngineActive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  const abortControllers = useRef<Record<string, AbortController>>({});
  
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // 1. 初始化與 OAuth 回傳處理
  useEffect(() => {
    const init = async () => {
      // 檢查 API Key (Veo 模型強制要求)
      const win = window as any;
      if (win.aistudio?.hasSelectedApiKey) {
        setHasApiKey(await win.aistudio.hasSelectedApiKey());
      } else {
        setHasApiKey(true);
      }

      // 檢查 URL 代碼
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const pendingId = localStorage.getItem('pilot_pending_auth_id');

      if (code && pendingId) {
        addLog("🔑 偵測到授權，正在交換永久權杖...");
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const data = await res.json();
          if (data.success) {
            setChannels(prev => prev.map(c => c.id === pendingId ? { ...c, auth: data.tokens } : c));
            addLog(`✅ YouTube 連結成功！`);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            addLog(`❌ 交換失敗: ${data.error}`);
          }
        } catch (e: any) {
          addLog(`❌ 授權異常: ${e.message}`);
        }
        localStorage.removeItem('pilot_pending_auth_id');
      }
    };
    init();

    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  const addLog = (msg: string) => {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    setGlobalLog(p => [`[${ts}] ${msg}`, ...p].slice(0, 50));
  };

  const updateChannel = (id: string, up: any) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  const deleteChannel = (id: string) => {
    if (window.confirm("確定要刪除此頻道核心？所有本地授權資訊將被清除。")) {
      setChannels(prev => prev.filter(c => c.id !== id));
      addLog(`🗑️ 頻道 [${id}] 已移除`);
    }
  };

  const startAuth = async (id: string) => {
    addLog("📡 正在導向 Google 授權頁面...");
    localStorage.setItem('pilot_pending_auth_id', id);
    try {
      const res = await fetch('/api/auth?action=url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      addLog(`❌ 授權請求失敗: ${e.message}`);
    }
  };

  const runPipeline = async (channel: any) => {
    if (isAnyChannelRendering) return;
    if (!channel.auth) {
      addLog(`❌ [${channel.name}] 失敗: 尚未連結 YouTube。`);
      return;
    }

    setIsAnyChannelRendering(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    try {
      addLog(`📡 [${channel.name}] 分析趨勢中...`);
      updateChannel(channel.id, { status: 'running', step: 10, lastLog: 'AI 策劃中...' });
      
      const r1 = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);
      
      updateChannel(channel.id, { pendingMetadata: d1.metadata, step: 30, lastLog: '正在渲染 9:16 Veo 影片...' });
      await executeRender(channel.id, d1.metadata, controller.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addLog(`❌ [${channel.name}] ${e.message}`);
        updateChannel(channel.id, { status: 'error', lastLog: e.message });
      }
    } finally {
      setIsAnyChannelRendering(false);
    }
  };

  const executeRender = async (channelId: string, metadata: any, signal: AbortSignal) => {
    const channel = channelsRef.current.find(c => c.id === channelId);
    const res = await fetch('/api/pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'render_and_upload', channel, metadata }),
      signal
    });
    const data = await res.json();

    if (data.success) {
      addLog(`🎉 [${channel.name}] 成功！影片 ID: ${data.videoId}`);
      updateChannel(channelId, { status: 'success', step: 100, lastLog: `已發布: ${data.videoId}`, pendingMetadata: null });
    } else {
      throw new Error(data.error || "流程中斷");
    }
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-black italic uppercase">Billing Access Required</h2>
          <p className="text-zinc-500 text-sm">此應用程序使用 Veo 生成影片，您必須選擇一個已啟用計費的 API Key。</p>
          <button onClick={async () => { await (window as any).aistudio.openSelectKey(); setHasApiKey(true); }} className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase">Open Dialog</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-cyan-500/30">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black font-black italic shadow-[0_0_20px_rgba(255,255,255,0.2)]">S</div>
          <h1 className="text-xl font-black italic tracking-tighter uppercase">ShortsPilot <span className="text-zinc-600">Onyx v8.8</span></h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => { setEditingId(null); setIsModalOpen(true); }} className="px-8 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase hover:scale-105 transition-transform active:scale-95">New Core</button>
        </div>
      </nav>

      <main className="flex-1 p-10 flex flex-col lg:flex-row gap-10 overflow-hidden">
        <div className="flex-1 space-y-6 max-w-4xl mx-auto w-full overflow-y-auto custom-scrollbar pr-4 pb-20">
          {channels.length === 0 && <div className="text-center py-20 border border-zinc-900 rounded-[3.5rem] text-zinc-700 font-black text-xs uppercase italic tracking-widest">No Active Cores Deployed.</div>}
          {channels.map(c => (
            <div key={c.id} className={`bg-zinc-950 border rounded-[3.5rem] p-10 transition-all duration-500 ${c.status === 'running' ? 'border-cyan-500 shadow-[0_0_50px_rgba(6,182,212,0.15)]' : 'border-zinc-900 hover:border-zinc-800'}`}>
              <div className="flex justify-between items-start gap-8">
                <div className="space-y-5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none">{c.name}</h2>
                    {c.auth ? 
                      <span className="text-[9px] font-black px-4 py-1.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full tracking-[0.2em]">YOUTUBE_OK</span> :
                      <button onClick={() => startAuth(c.id)} className="text-[9px] font-black px-4 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full hover:bg-red-500 hover:text-white transition-all tracking-[0.2em] animate-glow">UNLINKED</button>
                    }
                  </div>
                  <div className="flex gap-3">
                     <span className="text-[10px] text-zinc-700 font-black uppercase tracking-widest px-3 py-1 bg-zinc-900/50 rounded-lg border border-zinc-800/50">{c.niche}</span>
                  </div>
                  <p className={`text-[11px] font-bold tracking-tight leading-relaxed max-w-lg ${c.status === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>
                    {c.lastLog || 'System Standby. Awaiting Task Signal.'}
                  </p>
                </div>
                
                <div className="flex flex-col gap-3 flex-shrink-0 items-end">
                  {c.status === 'running' ? (
                    <button onClick={() => abortControllers.current[c.id]?.abort()} className="px-12 py-5 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-lg shadow-red-500/20">Kill</button>
                  ) : (
                    <>
                      <button disabled={isAnyChannelRendering || !c.auth} onClick={() => runPipeline(c)} className={`px-14 py-5 rounded-[2rem] font-black text-[10px] uppercase transition-all ${isAnyChannelRendering || !c.auth ? 'bg-zinc-900 text-zinc-700 opacity-50 cursor-not-allowed' : 'bg-white text-black hover:invert'}`}>Launch Core</button>
                      <button onClick={() => deleteChannel(c.id)} className="px-6 py-2 text-zinc-700 hover:text-red-500 font-black text-[9px] uppercase transition-colors tracking-widest">Delete Core</button>
                    </>
                  )}
                </div>
              </div>
              
              {c.status === 'running' && (
                <div className="mt-10 h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all duration-700 shadow-[0_0_10px_rgba(6,182,212,0.8)]" style={{ width: `${c.step}%` }}></div>
                </div>
              )}
            </div>
          ))}
        </div>

        <aside className="w-full lg:w-[380px] flex flex-col h-[calc(100vh-180px)]">
          <div className="flex-1 flex flex-col bg-zinc-950 border border-zinc-900 rounded-[3rem] p-8 overflow-hidden shadow-2xl">
            <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.4em] text-center italic mb-8">Trace Log Monitor</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar font-mono text-[10px] leading-relaxed">
              {globalLog.map((log, i) => (
                <div key={i} className={`p-4 rounded-2xl border bg-black/40 transition-all ${log.includes('✅') || log.includes('🎉') ? 'text-cyan-400 border-cyan-900/20' : log.includes('❌') ? 'text-red-400 border-red-900/20' : 'text-zinc-500 border-zinc-900'}`}>
                  {log}
                </div>
              ))}
              {globalLog.length === 0 && <div className="text-center py-10 text-zinc-800 font-black italic text-[9px] uppercase tracking-widest">No signals recorded.</div>}
            </div>
          </div>
        </aside>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-2xl flex items-center justify-center p-8 z-[100] animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-lg rounded-[4rem] p-12 space-y-12 shadow-2xl">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase text-center">Deploy New Core</h2>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-4">Channel Identity</label>
                <input id="n-name" className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500 transition-all" placeholder="E.G. TECH HARBOR" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest ml-4">Strategic Niche</label>
                <input id="n-niche" className="w-full bg-zinc-900 border-none rounded-2xl p-6 text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-1 focus:ring-cyan-500 transition-all" placeholder="E.G. AI NEWS / EXPERIMENTS" />
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-7 text-zinc-600 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors">Abort</button>
              <button onClick={() => {
                const name = (document.getElementById('n-name') as HTMLInputElement).value;
                const niche = (document.getElementById('n-niche') as HTMLInputElement).value;
                if (!name) return;
                setChannels([...channels, { id: Date.now().toString(), name, niche, status: 'idle', step: 0, auth: null, lastLog: 'Core successfully initialized.' }]);
                setIsModalOpen(false);
              }} className="flex-1 py-7 bg-white text-black rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl hover:invert transition-all">Establish Core</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
