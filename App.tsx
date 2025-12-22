
import React, { useState, useEffect } from 'react';
import { ChannelConfig } from './types';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newChan, setNewChan] = useState({ name: '', niche: 'AI 科技' });
  const [globalLog, setGlobalLog] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('pilot_v8_data');
    if (saved) setChannels(JSON.parse(saved));

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_v8_pending');

    if (code && pendingId) {
      handleTokenExchange(code, pendingId);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_v8_data', JSON.stringify(channels));
  }, [channels]);

  const addLog = (msg: string) => setGlobalLog(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));

  const handleTokenExchange = async (code: string, id: string) => {
    window.history.replaceState({}, document.title, "/");
    localStorage.removeItem('pilot_v8_pending');
    addLog("正在完成 YouTube 安全連結...");
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        setChannels(prev => prev.map(c => c.id === id ? { ...c, auth: data.tokens } : c));
        addLog("YouTube 頻道連結成功！");
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      addLog(`授權失敗: ${e.message}`);
    }
  };

  const startAuth = async (channel: ChannelConfig) => {
    localStorage.setItem('pilot_v8_pending', channel.id);
    const res = await fetch('/api/auth?action=url');
    const { url } = await res.json();
    window.location.href = url;
  };

  const runPipeline = async (channel: ChannelConfig) => {
    const update = (up: Partial<ChannelConfig>) => {
      setChannels(p => p.map(c => c.id === channel.id ? { ...c, ...up } : c));
    };

    update({ status: 'running', step: 1, lastLog: '正在分析趨勢並企劃爆款腳本...' });
    addLog(`頻道「${channel.name}」啟動全自動流程...`);

    try {
      // Step 1: Analyze
      const r1 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const d1 = await r1.json();
      if (!d1.success) throw new Error(d1.error);
      addLog(`AI 企劃完成：${d1.metadata.title}`);

      // Step 2 & 3: Render & Upload (Combined)
      update({ step: 2, lastLog: '正在生成影片並同步至 YouTube (約需 60 秒)...' });
      addLog("Veo 3.1 渲染引擎啟動，完成後將直接發布...");
      
      const r2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          stage: 'render_and_upload', 
          channel, 
          metadata: d1.metadata 
        })
      });
      
      const d2 = await r2.json();
      if (!d2.success) throw new Error(d2.error);

      update({ status: 'success', step: 3, lastLog: `發布成功！影片 ID: ${d2.videoId}` });
      addLog(`[成功] 頻道「${channel.name}」已發布：${d2.url}`);
    } catch (e: any) {
      update({ status: 'error', lastLog: `失敗: ${e.message}` });
      addLog(`[錯誤] ${channel.name}: ${e.message}`);
    }
  };

  const createChannel = () => {
    const c: ChannelConfig = {
      id: Math.random().toString(36).substr(2, 9),
      name: newChan.name || '我的 Shorts 頻道',
      niche: newChan.niche,
      auth: null,
      status: 'idle',
      step: 0
    };
    setChannels([...channels, c]);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <nav className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black italic shadow-lg shadow-indigo-500/20">S</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ShortsPilot <span className="text-indigo-500">v8</span></h1>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-xl shadow-indigo-900/40 transition-all">+ 新增頻道</button>
      </nav>

      <div className="flex-1 flex flex-col lg:flex-row">
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {channels.map(c => (
              <div key={c.id} className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 hover:border-indigo-500/30 transition-all shadow-2xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-black text-white">{c.name}</h2>
                      <span className="bg-indigo-500/10 text-indigo-400 text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-widest">{c.niche}</span>
                    </div>
                    <p className={`text-sm font-semibold ${c.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{c.lastLog || '等待執行中...'}</p>
                  </div>

                  <div className="flex gap-4">
                    {!c.auth ? (
                      <button onClick={() => startAuth(c)} className="px-6 py-3 bg-amber-600/10 text-amber-500 border border-amber-600/20 rounded-2xl font-bold hover:bg-amber-600 hover:text-white transition-all">
                        連結 YouTube
                      </button>
                    ) : (
                      <button 
                        disabled={c.status === 'running'}
                        onClick={() => runPipeline(c)}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold disabled:bg-slate-800 disabled:text-slate-600 hover:scale-105 transition-all shadow-lg shadow-indigo-900/20"
                      >
                        {c.status === 'running' ? '執行中...' : '發布真實影片'}
                      </button>
                    )}
                    <button onClick={() => setChannels(channels.filter(x => x.id !== c.id))} className="p-3 bg-slate-800 text-slate-500 hover:bg-red-600 hover:text-white rounded-2xl transition-all">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {c.status === 'running' && (
                  <div className="mt-8 space-y-3">
                    <div className="flex justify-between text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">
                      <span>BACKEND_TUNNEL_ACTIVE</span>
                      <span>Progress {c.step} / 3</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all duration-1000 shadow-[0_0_15px_rgba(79,70,229,0.5)]" style={{ width: `${(c.step! / 3) * 100}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full lg:w-96 border-l border-slate-800 bg-slate-950/50 p-6 flex flex-col">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 px-2">System Console</h3>
          <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px] leading-relaxed">
            {globalLog.map((log, i) => (
              <div key={i} className={`p-2 rounded-lg ${log.includes('錯誤') ? 'bg-red-950/20 text-red-400' : log.includes('成功') ? 'bg-emerald-950/20 text-emerald-400' : 'text-slate-500'}`}>
                {log}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[3rem] p-10 shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-8 italic uppercase tracking-tight">Create Automation</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">頻道標籤</label>
                <input autoFocus className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="例如：主頻道-測試用" value={newChan.name} onChange={e => setNewChan({...newChan, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">內容主軸</label>
                <input className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-600" placeholder="例如：可愛寵物" value={newChan.niche} onChange={e => setNewChan({...newChan, niche: e.target.value})} />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-500 font-bold">取消</button>
                <button onClick={createChannel} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">建立</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
