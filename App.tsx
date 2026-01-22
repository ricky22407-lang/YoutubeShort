
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig } from './types';
import { CharacterStudio } from './components/CharacterStudio';

// 多語系配置 (UI 預設使用 zh-TW)
const I18N = {
  'zh-TW': {
    establish: "建立核心",
    edit: "配置核心",
    engine_ready: "系統就緒",
    engine_active: "引擎運轉中",
    manual_burst: "手動爆發",
    processing: "處理中...",
    destroy: "銷毀核心",
    telemetry: "系統遙測",
    schedule: "排程管理",
    auto_deploy: "自動部署",
    save: "儲存設定",
    abort: "取消",
    niche: "核心關鍵字 (搜尋用)",
    niche_ph: "例如: Anime, Cat, Tech...",
    concept: "詳細風格與概念 (AI 生成用)",
    concept_ph: "例如：日本動漫的角色，擬真化並且結合日本日常生活的動作或背景，像是真實活在日本的vlog紀錄...",
    lang: "語系",
    name: "名稱",
    days: ["日", "一", "二", "三", "四", "五", "六"]
  },
  'en': {
    establish: "Establish Core",
    edit: "Config Core",
    engine_ready: "System Ready",
    engine_active: "Engine Active",
    manual_burst: "Manual Burst",
    processing: "Processing...",
    destroy: "Destroy Core",
    telemetry: "Telemetry",
    schedule: "Schedule",
    auto_deploy: "Auto Deploy",
    save: "Save Config",
    abort: "Abort",
    niche: "Core Keyword (For Search)",
    niche_ph: "e.g., Anime, Cat, Tech...",
    concept: "Detailed Concept (For AI)",
    concept_ph: "e.g., Realistic anime characters in daily Japanese life...",
    lang: "Language",
    name: "Name",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  }
};

const App: React.FC = () => {
  const [view, setView] = useState<'core' | 'studio'>('core'); // 新增視圖狀態
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isEngineActive, setIsEngineActive] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);
  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  
  const abortControllers = useRef<Record<string, AbortController>>({});
  const lastCheckMinute = useRef<number>(-1);

  const addLog = (msg: string) => {
    const now = new Date();
    setGlobalLog(p => [`[${now.toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));
  };

  const updateChannel = (id: string, up: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  const runPipeline = async (channel: ChannelConfig) => {
    if (isAnyChannelRendering) return;
    setIsAnyChannelRendering(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    try {
      updateChannel(channel.id, { status: 'running', step: 10, lastLog: '分析趨勢中...' });
      
      // 判斷是否為角色自動化模式
      if (channel.mode === 'character' && channel.characterProfile) {
         // TODO: 未來可在此呼叫 character_pipeline 進行自動化生成
         // 目前 Studio 主要是手動生成，排程功能僅儲存 Config
         addLog(`⚠️ [${channel.name}] 角色自動化模式尚未完全連接至主管線，請在 Studio 中手動生成。`);
         updateChannel(channel.id, { status: 'success', step: 100, lastLog: '任務已記錄 (等待實作)' });
         setIsAnyChannelRendering(false);
         return;
      }

      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel }),
        signal: controller.signal
      });
      
      const d1 = await res.json();
      if (!d1.success) throw new Error(d1.error);
      
      addLog(`🧠 [${channel.name}] 策略：${d1.metadata.title}`);
      updateChannel(channel.id, { step: 40, lastLog: 'Veo 影片生成中...' });

      const res2 = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: d1.metadata }),
        signal: controller.signal
      });

      const d2 = await res2.json();
      if (!d2.success) throw new Error(d2.error);

      if (d2.updatedAuth) {
        updateChannel(channel.id, { auth: d2.updatedAuth });
      }

      addLog(`🎉 [${channel.name}] 上傳成功！ID: ${d2.videoId}`);
      updateChannel(channel.id, { status: 'success', step: 100, lastLog: `發布成功！ID: ${d2.videoId}` });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addLog(`❌ [${channel.name}] ${e.message}`);
        updateChannel(channel.id, { status: 'error', lastLog: e.message });
      }
    } finally {
      setIsAnyChannelRendering(false);
    }
  };

  // 全自動掃描引擎 (每分鐘檢查一次)
  useEffect(() => {
    if (!isEngineActive) return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentMin = now.getMinutes();
      if (currentMin === lastCheckMinute.current) return;
      lastCheckMinute.current = currentMin;

      const day = now.getDay();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      channels.forEach(c => {
        if (!c.autoDeploy || !c.weeklySchedule || !c.auth || c.status === 'running') return;
        
        const isScheduledDay = c.weeklySchedule.days.includes(day);
        const isScheduledTime = c.weeklySchedule.times.includes(timeStr);
        const slotKey = `${day}_${timeStr}`;

        if (isScheduledDay && isScheduledTime && c.lastTriggeredSlot !== slotKey) {
          addLog(`⏰ [排程觸發] ${c.name} 開始自動執行...`);
          updateChannel(c.id, { lastTriggeredSlot: slotKey });
          runPipeline(c);
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [channels, isEngineActive, isAnyChannelRendering]);

  // 初始化與 OAuth
  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_pending_auth_id');
    if (code && pendingId) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setChannels(prev => prev.map(c => c.id === pendingId ? { ...c, auth: d.tokens } : c));
          addLog("✅ YouTube 授權綁定成功。");
          window.history.replaceState({}, '', '/');
        }
      });
      localStorage.removeItem('pilot_pending_auth_id');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  // 渲染 Character Studio
  if (view === 'studio') {
    return <CharacterStudio onBack={() => setView('core')} channels={channels} setChannels={setChannels} />;
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30">
      {/* Navbar */}
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black font-black italic shadow-2xl">S</div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase leading-none">ShortsPilot <span className="text-zinc-600">v8.15</span></h1>
            <div className="flex items-center gap-4 mt-2">
               <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsEngineActive(!isEngineActive)}>
                <div className={`w-2 h-2 rounded-full ${isEngineActive ? 'bg-cyan-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">
                  {isEngineActive ? I18N['zh-TW'].engine_active : "引擎已停止"}
                </span>
              </div>
              
              {/* View Switcher */}
              <div className="flex bg-zinc-900 rounded-full p-1">
                <button onClick={() => setView('core')} className="px-4 py-1 bg-zinc-800 text-white text-[9px] font-black rounded-full shadow-lg">核心管理 (Core)</button>
                <button onClick={() => setView('studio')} className="px-4 py-1 text-zinc-500 text-[9px] font-black hover:text-purple-400 transition-colors">影音工作室 (Studio)</button>
              </div>
            </div>
          </div>
        </div>
        <button 
          onClick={() => { setEditingChannel(null); setIsModalOpen(true); }}
          className="px-8 py-3.5 bg-white text-black rounded-full font-black text-[10px] uppercase hover:scale-105 transition-all active:scale-95"
        >
          {I18N['zh-TW'].establish}
        </button>
      </nav>

      <main className="p-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-10">
        {/* Channel Cards */}
        <div className="flex-1 space-y-8">
          {channels.length === 0 && (
            <div className="py-40 text-center opacity-20 font-black italic uppercase tracking-[1em]">尚未建立核心</div>
          )}
          {channels.map(c => {
            const t = I18N[c.language || 'zh-TW'];
            const isCharacterMode = c.mode === 'character';

            return (
              <div key={c.id} className={`bg-zinc-950 border rounded-[3rem] p-10 transition-all shadow-2xl ${c.status === 'running' ? 'border-cyan-500 shadow-cyan-500/10' : isCharacterMode ? 'border-purple-900/50' : 'border-zinc-900'}`}>
                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <h2 className={`text-3xl font-black italic uppercase tracking-tighter ${isCharacterMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500' : ''}`}>
                        {c.name}
                      </h2>
                      {!isCharacterMode && (
                        <button onClick={() => { setEditingChannel(c); setIsModalOpen(true); }} className="p-2 hover:bg-zinc-900 rounded-full text-zinc-600 hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                        </button>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-4">
                      {isCharacterMode ? (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-purple-900/20 text-purple-400 rounded-full border border-purple-800">虛擬偶像核心</span>
                      ) : (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-zinc-900 text-zinc-400 rounded-full border border-zinc-800">{c.niche}</span>
                      )}
                      
                      {c.auth ? (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">已連結 YouTube</span>
                      ) : (
                        <button onClick={() => { localStorage.setItem('pilot_pending_auth_id', c.id); window.location.href='/api/auth?action=url'; }} className="text-[10px] font-black px-4 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">連結 YouTube</button>
                      )}
                      {c.autoDeploy && <span className="text-[10px] font-black px-4 py-1.5 bg-cyan-500/10 text-cyan-500 rounded-full border border-cyan-500/20">自動化開啟</span>}
                    </div>

                    <p className="mt-4 text-[11px] text-zinc-600 line-clamp-2 italic border-l-2 border-zinc-800 pl-3">
                      {isCharacterMode ? `自動化目標: ${c.characterProfile?.name} / ${c.targetVibeId}` : (c.concept || "尚未設定詳細概念")}
                    </p>

                    <p className={`mt-6 text-[11px] font-bold leading-relaxed ${c.status === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>
                      {c.lastLog || "準備就緒"}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-3 min-w-[200px]">
                    <button 
                      disabled={isAnyChannelRendering || !c.auth || isCharacterMode} 
                      onClick={() => runPipeline(c)} 
                      className={`w-full py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${c.status === 'running' || isCharacterMode ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed' : 'bg-white text-black hover:bg-cyan-500 hover:text-white shadow-xl hover:shadow-cyan-500/20'}`}
                    >
                      {isCharacterMode ? "自動任務執行中" : (c.status === 'running' ? t.processing : t.manual_burst)}
                    </button>
                    <button 
                      onClick={() => setChannels(channels.filter(x => x.id !== c.id))}
                      className="text-[9px] font-black text-zinc-800 hover:text-red-500 transition-colors uppercase tracking-[0.2em]"
                    >
                      {t.destroy}
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                {c.status === 'running' && (
                  <div className="mt-10 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 shadow-[0_0_20px_cyan] transition-all duration-1000" style={{ width: `${c.step}%` }}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Telemetry Sidebar */}
        <aside className="w-full lg:w-96 space-y-6">
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 h-[600px] overflow-hidden flex flex-col shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">{I18N['zh-TW'].telemetry}</h3>
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar font-mono text-[10px] pr-2">
              {globalLog.map((log, i) => (
                <div key={i} className={`pb-3 border-b border-zinc-900/50 leading-relaxed ${log.includes('❌') ? 'text-red-500' : log.includes('✅') ? 'text-cyan-500' : log.includes('⏰') ? 'text-yellow-500' : 'text-zinc-600'}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Init/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-xl flex items-center justify-center p-6 z-[200] animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 p-12 rounded-[4rem] w-full max-w-2xl space-y-8 shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <h2 className="text-3xl font-black italic text-center uppercase tracking-tighter">
              {editingChannel ? I18N['zh-TW'].edit : I18N['zh-TW'].establish}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="text-[9px] font-black text-zinc-600 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].name}</label>
                  <input id="n-name" defaultValue={editingChannel?.name} className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500 transition-all" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-cyan-600 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].niche}</label>
                  <input id="n-niche" defaultValue={editingChannel?.niche} placeholder={I18N['zh-TW'].niche_ph} className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500 transition-all" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-zinc-600 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].lang}</label>
                  <select id="n-lang" defaultValue={editingChannel?.language || 'zh-TW'} className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-sm font-bold outline-none appearance-none">
                    <option value="zh-TW">繁體中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                 {/* Concept TextArea */}
                 <div>
                  <label className="text-[9px] font-black text-purple-400 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].concept}</label>
                  <textarea 
                    id="n-concept" 
                    defaultValue={editingChannel?.concept} 
                    placeholder={I18N['zh-TW'].concept_ph} 
                    className="w-full h-32 bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-xs font-bold leading-relaxed outline-none focus:border-purple-500 transition-all resize-none"
                  />
                </div>

                <div className="p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{I18N['zh-TW'].schedule}</label>
                    <input type="checkbox" id="n-auto" defaultChecked={editingChannel?.autoDeploy} className="w-4 h-4 accent-cyan-500" />
                  </div>
                  
                  <div className="flex gap-2 mb-6 justify-between">
                    {[0,1,2,3,4,5,6].map(d => (
                      <div key={d} className="flex flex-col items-center gap-2">
                        <span className="text-[8px] text-zinc-700 font-black">{I18N['zh-TW'].days[d]}</span>
                        <input type="checkbox" className="n-day-cb w-4 h-4 accent-white" data-day={d} defaultChecked={editingChannel?.weeklySchedule?.days.includes(d)} />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="text-[8px] font-black text-zinc-700 uppercase mb-2 block tracking-widest">時間點 (HH:mm, 逗號隔開)</label>
                    <input id="n-times" defaultValue={editingChannel?.weeklySchedule?.times.join(', ') || '10:00, 18:00'} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs font-mono outline-none" placeholder="09:00, 21:00" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-6 pt-6">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 text-[11px] font-black uppercase text-zinc-600 hover:text-white transition-colors">{I18N['zh-TW'].abort}</button>
              <button 
                onClick={() => {
                  const name = (document.getElementById('n-name') as HTMLInputElement).value;
                  const niche = (document.getElementById('n-niche') as HTMLInputElement).value;
                  const concept = (document.getElementById('n-concept') as HTMLTextAreaElement).value; // Get Concept
                  const lang = (document.getElementById('n-lang') as HTMLSelectElement).value;
                  const auto = (document.getElementById('n-auto') as HTMLInputElement).checked;
                  const times = (document.getElementById('n-times') as HTMLInputElement).value.split(',').map(t => t.trim());
                  const days = Array.from(document.querySelectorAll('.n-day-cb:checked')).map(el => parseInt(el.getAttribute('data-day')!));

                  const configPayload = {
                    name, niche, concept, language: lang as any, autoDeploy: auto, // Save Concept
                    weeklySchedule: { days, times }
                  };

                  if (editingChannel) {
                    setChannels(prev => prev.map(c => c.id === editingChannel.id ? { ...c, ...configPayload } : c));
                    addLog(`📝 已更新頻道配置: ${name}`);
                  } else {
                    const newId = Date.now().toString();
                    setChannels([...channels, { id: newId, status: 'idle', step: 0, auth: null, ...configPayload }]);
                    addLog(`✨ 已建立新核心: ${name}`);
                  }
                  setIsModalOpen(false);
                }} 
                className="flex-3 bg-white text-black p-6 rounded-[2rem] text-[11px] font-black uppercase hover:bg-cyan-500 hover:text-white transition-all shadow-xl"
              >
                {I18N['zh-TW'].save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
