
import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, CharacterProfile } from './types';
import { CreativeStudio } from './components/CreativeStudio';

// 多語系配置 (UI 預設使用 zh-TW)
const I18N = {
  'zh-TW': {
    establish: "建立核心",
    edit: "帳號設定",
    engine_ready: "系統就緒",
    engine_active: "引擎運轉中",
    engine_stopped: "引擎已停止",
    manual_burst: "手動爆發",
    processing: "處理中...",
    destroy: "銷毀核心",
    telemetry: "系統遙測",
    schedule: "排程管理",
    auto_deploy: "自動部署",
    save: "儲存設定",
    abort: "取消",
    niche: "核心關鍵字 (搜尋用)",
    niche_ph: "例如: 動漫, 貓咪, 科技...",
    concept: "詳細風格與概念 (AI 生成用)",
    concept_ph: "例如：日本動漫的角色，擬真化並且結合日本日常生活的動作或背景，像是真實活在日本的vlog紀錄...",
    lang: "語系",
    name: "名稱",
    days: ["日", "一", "二", "三", "四", "五", "六"],
    core_management: "核心管理",
    creative_studio: "創作中心",
    enter_studio: "進入創作中心",
    not_connected: "未連結",
    connected: "已連結",
    connect: "連結",
    reconnect: "重新連結",
    coming_soon: "即將推出",
    basic_info: "基本資訊",
    social_connect: "社群連結",
    persona_setting: "人設設定",
    ref_sheet: "三視圖 / 設定圖",
    upload: "上傳",
    front_view: "正面",
    expression: "表情",
    occupation: "職業",
    personality: "個性",
    constraints: "限制 / 規範",
    save_success: "已更新帳號設定",
    create_success: "已建立新核心",
    yt_connected: "已連結 YouTube",
    yt_not_connected: "未連結 YouTube",
    auto_on: "自動化開啟",
    ready: "準備就緒",
    analyzing: "分析趨勢中...",
    generating_video: "Veo 影片生成中...",
    upload_success: "發布成功！",
    task_recorded: "任務已記錄 (等待實作)",
    virtual_idol: "虛擬偶像核心",
    not_set: "尚未設定詳細概念",
    no_core: "尚未建立核心",
    connect_platforms: "連結平台",
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    auth_success: "YouTube 授權綁定成功。",
    ip_label: "IP:",
    new_channel: "新頻道",
    general_niche: "一般",
    new_agent: "新代理人",
    voice_settings: "聲音設定",
    dashboard: "儀表板",
    studio: "創作中心"
  },
  'en': {
    establish: "Establish Core",
    edit: "Account Settings",
    engine_ready: "System Ready",
    engine_active: "Engine Active",
    engine_stopped: "Engine Stopped",
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
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    core_management: "Core Management",
    creative_studio: "Creative Studio",
    enter_studio: "Enter Studio",
    not_connected: "Not Connected",
    connected: "Connected",
    connect: "Connect",
    reconnect: "Reconnect",
    coming_soon: "Coming Soon",
    basic_info: "Basic Info",
    social_connect: "Social Connect",
    persona_setting: "Persona Setting",
    ref_sheet: "Reference Sheet",
    upload: "Upload",
    front_view: "Front",
    expression: "Expression",
    occupation: "Occupation",
    personality: "Personality",
    constraints: "Constraints",
    save_success: "Account settings updated",
    create_success: "New core established",
    yt_connected: "YouTube Connected",
    yt_not_connected: "YouTube Not Connected",
    auto_on: "Auto On",
    ready: "Ready",
    analyzing: "Analyzing...",
    generating_video: "Generating Veo Video...",
    upload_success: "Upload Success!",
    task_recorded: "Task Recorded (Pending Implementation)",
    virtual_idol: "Virtual Idol Core",
    not_set: "Concept not set",
    no_core: "No Core Established",
    connect_platforms: "Connect Platforms",
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    auth_success: "YouTube Auth Connected Successfully.",
    ip_label: "IP:",
    new_channel: "New Channel",
    general_niche: "General",
    new_agent: "New Agent"
  }
};

const DEFAULT_PROFILE: CharacterProfile = {
  id: 'char_1',
  name: '新代理人',
  age: '20',
  occupation: '數位創作者',
  gender: '女性',
  personality: '好奇心強，充滿活力，有點笨拙但充滿自信。',
  voiceTone: '輕鬆，節奏快，使用大量流行語。',
  contentFocus: '科技評論，日常 Vlog，舞蹈挑戰',
  constraints: '不吸煙，不談政治，保持露臉。',
  description: '一個留著粉紅色波波頭的可愛女孩。',
  images: {}
};

const App: React.FC = () => {
  const [view, setView] = useState<'core' | 'studio'>('core');
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isEngineActive, setIsEngineActive] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);
  const [modalTab, setModalTab] = useState<'basic' | 'social' | 'persona'>('basic');
  
  // Temporary State for Modal Editing
  const [tempProfile, setTempProfile] = useState<CharacterProfile>(DEFAULT_PROFILE);
  const [tempName, setTempName] = useState('');
  const [tempNiche, setTempNiche] = useState('');
  const [tempConcept, setTempConcept] = useState('');
  const [tempLang, setTempLang] = useState<'zh-TW' | 'en'>('zh-TW');
  const [tempMptConfig, setTempMptConfig] = useState<ChannelConfig['mptConfig']>({});

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

  // Sync editing channel to temp profile and basic info
  useEffect(() => {
    if (editingChannel) {
        setTempProfile(editingChannel.characterProfile || DEFAULT_PROFILE);
        setTempName(editingChannel.name);
        setTempNiche(editingChannel.niche);
        setTempConcept(editingChannel.concept || '');
        setTempLang(editingChannel.language || 'zh-TW');
        setTempMptConfig(editingChannel.mptConfig || {});
    } else {
        setTempProfile(DEFAULT_PROFILE);
        setTempName('');
        setTempNiche('');
        setTempConcept('');
        setTempLang('zh-TW');
        setTempMptConfig({});
    }
  }, [editingChannel]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: keyof CharacterProfile['images']) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempProfile(prev => ({
            ...prev,
            images: { ...prev.images, [type]: reader.result as string }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const runPipeline = async (channel: ChannelConfig) => {
    if (isAnyChannelRendering) return;
    setIsAnyChannelRendering(true);
    const controller = new AbortController();
    abortControllers.current[channel.id] = controller;

    try {
      updateChannel(channel.id, { status: 'running', step: 10, lastLog: I18N['zh-TW'].analyzing });
      
      if (channel.mode === 'character' && channel.characterProfile) {
         addLog(`⚠️ [${channel.name}] ${I18N['zh-TW'].task_recorded}`);
         updateChannel(channel.id, { status: 'success', step: 100, lastLog: I18N['zh-TW'].task_recorded });
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
      updateChannel(channel.id, { step: 40, lastLog: I18N['zh-TW'].generating_video });

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

      addLog(`🎉 [${channel.name}] ${I18N['zh-TW'].upload_success} ID: ${d2.videoId}`);
      updateChannel(channel.id, { status: 'success', step: 100, lastLog: `${I18N['zh-TW'].upload_success} ID: ${d2.videoId}` });
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

    // Handle Google Auth Callback
    if (code && pendingId && !params.get('meta_auth_success')) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setChannels(prev => prev.map(c => c.id === pendingId ? { ...c, auth: d.tokens } : c));
          addLog("✅ " + I18N['zh-TW'].auth_success);
          window.history.replaceState({}, '', '/');
        }
      });
      localStorage.removeItem('pilot_pending_auth_id');
    }

    // Handle Meta Auth Callback
    const metaAuthSuccess = params.get('meta_auth_success');
    const platform = params.get('platform');
    const metaCode = params.get('code');
    
    if (metaAuthSuccess && platform && metaCode && pendingId) {
        setChannels(prev => prev.map(c => {
            if (c.id === pendingId) {
                const socialUpdate = { ...c.social || { youtube: { connected: false, upload: false }, instagram: { connected: false, upload: false }, facebook: { connected: false, upload: false } } };
                if (platform === 'instagram') socialUpdate.instagram = { connected: true, upload: true };
                if (platform === 'facebook') socialUpdate.facebook = { connected: true, upload: true };
                return { ...c, social: socialUpdate };
            }
            return c;
        }));
        addLog(`✅ ${platform === 'instagram' ? I18N['zh-TW'].instagram : I18N['zh-TW'].facebook} ${I18N['zh-TW'].connected}`);
        window.history.replaceState({}, '', '/');
        localStorage.removeItem('pilot_pending_auth_id');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pilot_onyx_v8_data', JSON.stringify(channels));
  }, [channels]);

  // 渲染 Creative Studio
  if (view === 'studio') {
    return <CreativeStudio onBack={() => setView('core')} channels={channels} setChannels={setChannels} />;
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
                  {isEngineActive ? I18N['zh-TW'].engine_active : I18N['zh-TW'].engine_stopped}
                </span>
              </div>
              
              {/* View Switcher */}
              <div className="flex bg-zinc-900 rounded-full p-1">
                <button onClick={() => setView('core')} className="px-4 py-1 bg-zinc-800 text-white text-[9px] font-black rounded-full shadow-lg">{I18N['zh-TW'].core_management}</button>
                <button 
                  onClick={() => setView('studio')} 
                  disabled={channels.length === 0}
                  className={`px-4 py-1 text-[9px] font-black transition-colors ${channels.length === 0 ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-purple-400'}`}
                >
                  {I18N['zh-TW'].creative_studio}
                </button>
              </div>
            </div>
          </div>
        </div>
        <button 
          onClick={() => { setEditingChannel(null); setModalTab('basic'); setIsModalOpen(true); }}
          className="px-8 py-3.5 bg-white text-black rounded-full font-black text-[10px] uppercase hover:scale-105 transition-all active:scale-95"
        >
          {I18N['zh-TW'].establish}
        </button>
      </nav>

      <main className="p-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-10">
        {/* Channel Cards */}
        <div className="flex-1 space-y-8">
          {/* Trend Source Info */}
          <div className="flex justify-between items-center px-4">
              <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                      Trend Source: Google Trends & YouTube API
                  </span>
              </div>
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                  Last Update: {new Date().toLocaleTimeString()}
              </span>
          </div>

          {channels.length === 0 && (
            <div className="py-40 text-center opacity-20 font-black italic uppercase tracking-[1em]">{I18N['zh-TW'].no_core}</div>
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
                      <button onClick={() => { setEditingChannel(c); setModalTab('basic'); setIsModalOpen(true); }} className="p-2 hover:bg-zinc-900 rounded-full text-zinc-600 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-4">
                      {isCharacterMode ? (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-purple-900/20 text-purple-400 rounded-full border border-purple-800">{I18N['zh-TW'].virtual_idol}</span>
                      ) : (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-zinc-900 text-zinc-400 rounded-full border border-zinc-800">{c.niche}</span>
                      )}
                      
                      {c.auth ? (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">{I18N['zh-TW'].yt_connected}</span>
                      ) : (
                        <span className="text-[10px] font-black px-4 py-1.5 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">{I18N['zh-TW'].yt_not_connected}</span>
                      )}
                      {c.autoDeploy && <span className="text-[10px] font-black px-4 py-1.5 bg-cyan-500/10 text-cyan-500 rounded-full border border-cyan-500/20">{I18N['zh-TW'].auto_on}</span>}
                    </div>

                    <p className="mt-4 text-[11px] text-zinc-600 line-clamp-2 italic border-l-2 border-zinc-800 pl-3">
                      {isCharacterMode ? `${t.ip_label} ${c.characterProfile?.name} / ${c.characterProfile?.occupation}` : (c.concept || t.not_set)}
                    </p>

                    <p className={`mt-6 text-[11px] font-bold leading-relaxed ${c.status === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>
                      {c.lastLog || I18N['zh-TW'].ready}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-3 min-w-[200px]">
                    <button 
                      onClick={() => { setView('studio'); }} 
                      disabled={channels.length === 0}
                      className={`w-full py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${channels.length === 0 ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-white text-black hover:bg-purple-500 hover:text-white shadow-xl hover:shadow-purple-500/20'}`}
                    >
                      {I18N['zh-TW'].enter_studio}
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

      {/* Account Settings Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-xl flex items-center justify-center p-6 z-[200] animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-[3rem] w-full max-w-4xl space-y-6 shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">
                {editingChannel ? I18N['zh-TW'].edit : I18N['zh-TW'].establish}
                </h2>
                <div className="flex bg-zinc-900 rounded-full p-1">
                    <button 
                        onClick={() => setModalTab('basic')}
                        className={`px-6 py-2 rounded-full text-xs font-bold uppercase transition-all ${modalTab === 'basic' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {I18N['zh-TW'].basic_info}
                    </button>
                    <button 
                        onClick={() => setModalTab('social')}
                        className={`px-6 py-2 rounded-full text-xs font-bold uppercase transition-all ${modalTab === 'social' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {I18N['zh-TW'].social_connect}
                    </button>
                    <button 
                        onClick={() => setModalTab('persona')}
                        className={`px-6 py-2 rounded-full text-xs font-bold uppercase transition-all ${modalTab === 'persona' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {I18N['zh-TW'].persona_setting}
                    </button>
                </div>
            </div>
            
            <div className="min-h-[400px]">
                {/* === TAB: BASIC === */}
                {modalTab === 'basic' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                        <div className="space-y-6">
                            <div>
                                <label className="text-[9px] font-black text-zinc-600 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].name}</label>
                                <input 
                                    value={tempName} 
                                    onChange={e => setTempName(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500 transition-all" 
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-cyan-600 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].niche}</label>
                                <input 
                                    value={tempNiche} 
                                    onChange={e => setTempNiche(e.target.value)}
                                    placeholder={I18N['zh-TW'].niche_ph} 
                                    className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500 transition-all" 
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-zinc-600 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].lang}</label>
                                <select 
                                    value={tempLang} 
                                    onChange={e => setTempLang(e.target.value as any)}
                                    className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-sm font-bold outline-none appearance-none"
                                >
                                    <option value="zh-TW">繁體中文</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="text-[9px] font-black text-purple-400 uppercase mb-3 block tracking-widest">{I18N['zh-TW'].concept}</label>
                                <textarea 
                                    value={tempConcept} 
                                    onChange={e => setTempConcept(e.target.value)}
                                    placeholder={I18N['zh-TW'].concept_ph} 
                                    className="w-full h-64 bg-zinc-900 border border-zinc-800 p-5 rounded-2xl text-xs font-bold leading-relaxed outline-none focus:border-purple-500 transition-all resize-none"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* === TAB: SOCIAL === */}
                {modalTab === 'social' && (
                    <div className="space-y-6 animate-fade-in">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">{I18N['zh-TW'].connect_platforms}</h3>
                        
                        {/* YouTube */}
                        <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-xs">YT</div>
                                <div>
                                    <div className="text-sm font-bold text-white">{I18N['zh-TW'].youtube}</div>
                                    <div className="text-xs text-zinc-500">{editingChannel?.auth ? I18N['zh-TW'].connected : I18N['zh-TW'].not_connected}</div>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    if (editingChannel) localStorage.setItem('pilot_pending_auth_id', editingChannel.id);
                                    window.location.href = '/api/auth?action=url';
                                }}
                                className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${editingChannel?.auth ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-black hover:scale-105'}`}
                            >
                                {editingChannel?.auth ? I18N['zh-TW'].reconnect : I18N['zh-TW'].connect}
                            </button>
                        </div>

                        {/* Instagram */}
                        <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gradient-to-tr from-yellow-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs">IG</div>
                                <div>
                                    <div className="text-sm font-bold text-white">{I18N['zh-TW'].instagram}</div>
                                    <div className="text-xs text-zinc-500">{editingChannel?.social?.instagram?.connected ? I18N['zh-TW'].connected : I18N['zh-TW'].not_connected}</div>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    if (editingChannel) localStorage.setItem('pilot_pending_auth_id', editingChannel.id);
                                    localStorage.setItem('pilot_auth_platform', 'instagram');
                                    window.location.href = '/api/auth/meta?platform=instagram';
                                }}
                                className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${editingChannel?.social?.instagram?.connected ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-black hover:scale-105'}`}
                            >
                                {editingChannel?.social?.instagram?.connected ? I18N['zh-TW'].reconnect : I18N['zh-TW'].connect}
                            </button>
                        </div>

                        {/* Facebook */}
                        <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">FB</div>
                                <div>
                                    <div className="text-sm font-bold text-white">{I18N['zh-TW'].facebook}</div>
                                    <div className="text-xs text-zinc-500">{editingChannel?.social?.facebook?.connected ? I18N['zh-TW'].connected : I18N['zh-TW'].not_connected}</div>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    if (editingChannel) localStorage.setItem('pilot_pending_auth_id', editingChannel.id);
                                    localStorage.setItem('pilot_auth_platform', 'facebook');
                                    window.location.href = '/api/auth/meta?platform=facebook';
                                }}
                                className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${editingChannel?.social?.facebook?.connected ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-black hover:scale-105'}`}
                            >
                                {editingChannel?.social?.facebook?.connected ? I18N['zh-TW'].reconnect : I18N['zh-TW'].connect}
                            </button>
                        </div>
                    </div>
                )}

                {/* === TAB: PERSONA === */}
                {modalTab === 'persona' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in">
                        {/* Left: Images */}
                        <div className="md:col-span-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].ref_sheet}</label>
                                <div className="aspect-video bg-black rounded-xl border border-zinc-800 relative overflow-hidden group cursor-pointer">
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => handleImageUpload(e, 'threeView')} />
                                    {tempProfile.images?.threeView ? (
                                        <img src={tempProfile.images.threeView} className="w-full h-full object-contain" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs font-bold">{I18N['zh-TW'].upload}</div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="aspect-square bg-black rounded-xl border border-zinc-800 relative overflow-hidden group cursor-pointer">
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => handleImageUpload(e, 'front')} />
                                    {tempProfile.images?.front ? (
                                        <img src={tempProfile.images.front} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs font-bold">{I18N['zh-TW'].front_view}</div>
                                    )}
                                </div>
                                <div className="aspect-square bg-black rounded-xl border border-zinc-800 relative overflow-hidden group cursor-pointer">
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={e => handleImageUpload(e, 'expressionSheet')} />
                                    {tempProfile.images?.expressionSheet ? (
                                        <img src={tempProfile.images.expressionSheet} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs font-bold">{I18N['zh-TW'].expression}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Info */}
                        <div className="md:col-span-8 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].name}</label>
                                    <input 
                                        value={tempProfile.name} 
                                        onChange={e => setTempProfile({...tempProfile, name: e.target.value})}
                                        className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-sm font-bold outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].occupation}</label>
                                    <input 
                                        value={tempProfile.occupation || ''} 
                                        onChange={e => setTempProfile({...tempProfile, occupation: e.target.value})}
                                        className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-sm font-bold outline-none" 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].personality}</label>
                                <textarea 
                                    value={tempProfile.personality} 
                                    onChange={e => setTempProfile({...tempProfile, personality: e.target.value})}
                                    className="w-full h-20 bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-xs leading-relaxed outline-none resize-none" 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-red-500 uppercase block mb-2">{I18N['zh-TW'].constraints}</label>
                                <textarea 
                                    value={tempProfile.constraints} 
                                    onChange={e => setTempProfile({...tempProfile, constraints: e.target.value})}
                                    className="w-full h-16 bg-red-900/10 border border-red-900/30 p-3 rounded-xl text-xs text-red-200 leading-relaxed outline-none resize-none" 
                                />
                            </div>

                            {/* Voice Settings */}
                            <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800 space-y-4">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase block">{I18N['zh-TW'].voice_settings}</label>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[9px] text-zinc-600 uppercase block mb-1">Engine</label>
                                        <select 
                                            value={tempMptConfig?.ttsEngine || 'edge'} 
                                            onChange={e => setTempMptConfig({...tempMptConfig, ttsEngine: e.target.value as any})}
                                            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-xs font-bold outline-none"
                                        >
                                            <option value="edge">Edge TTS (Free)</option>
                                            <option value="elevenlabs">ElevenLabs (Paid)</option>
                                        </select>
                                    </div>
                                    
                                    {tempMptConfig?.ttsEngine === 'elevenlabs' ? (
                                        <div>
                                            <label className="text-[9px] text-zinc-600 uppercase block mb-1">Voice ID</label>
                                            <input 
                                                value={tempMptConfig?.elevenLabsVoiceId || ''} 
                                                onChange={e => setTempMptConfig({...tempMptConfig, elevenLabsVoiceId: e.target.value})}
                                                placeholder="21m00Tcm4TlvDq8ikWAM"
                                                className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-xs font-bold outline-none" 
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="text-[9px] text-zinc-600 uppercase block mb-1">Voice</label>
                                            <select 
                                                value={tempMptConfig?.voiceId || 'zh-TW-HsiaoChenNeural'} 
                                                onChange={e => setTempMptConfig({...tempMptConfig, voiceId: e.target.value})}
                                                className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-xs font-bold outline-none"
                                            >
                                                <option value="zh-TW-HsiaoChenNeural">HsiaoChen (TW Female)</option>
                                                <option value="zh-TW-YunJheNeural">YunJhe (TW Male)</option>
                                                <option value="zh-CN-XiaoxiaoNeural">Xiaoxiao (CN Female)</option>
                                                <option value="zh-CN-YunxiNeural">Yunxi (CN Male)</option>
                                                <option value="en-US-GuyNeural">Guy (US Male)</option>
                                                <option value="en-US-JennyNeural">Jenny (US Female)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Video Settings */}
                            <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800 space-y-4">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase block">Video Engine</label>
                                
                                <div>
                                    <label className="text-[9px] text-zinc-600 uppercase block mb-1">Model</label>
                                    <select 
                                        value={tempMptConfig?.videoEngine || 'veo'} 
                                        onChange={e => setTempMptConfig({...tempMptConfig, videoEngine: e.target.value as any})}
                                        className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-xs font-bold outline-none"
                                    >
                                        <option value="veo">Veo 3.1 (Google)</option>
                                        <option value="jimeng">Jimeng (即夢)</option>
                                        <option value="heygen">HeyGen (Digital Twin)</option>
                                        <option value="sora">Sora (OpenAI) - Coming Soon</option>
                                    </select>
                                </div>

                                {tempMptConfig?.videoEngine === 'heygen' && (
                                    <div>
                                        <label className="text-[9px] text-zinc-600 uppercase block mb-1">HeyGen Avatar ID</label>
                                        <input 
                                            value={tempMptConfig?.heygenAvatarId || ''} 
                                            onChange={e => setTempMptConfig({...tempMptConfig, heygenAvatarId: e.target.value})}
                                            placeholder="e.g. Avatar ID from HeyGen"
                                            className="w-full bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-xs font-bold outline-none" 
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-6 pt-6 border-t border-zinc-900">
              {editingChannel && (
                <button 
                  onClick={() => {
                    if (confirm(`確定要刪除核心 "${editingChannel.name}" 嗎？此動作無法復原。`)) {
                      setChannels(prev => prev.filter(c => c.id !== editingChannel.id));
                      addLog(`🗑️ 已刪除核心: ${editingChannel.name}`);
                      setIsModalOpen(false);
                    }
                  }}
                  className="flex-1 text-[11px] font-black uppercase text-red-600 hover:text-red-400 transition-colors"
                >
                  {I18N['zh-TW'].destroy}
                </button>
              )}
              <button onClick={() => setIsModalOpen(false)} className="flex-1 text-[11px] font-black uppercase text-zinc-600 hover:text-white transition-colors">{I18N['zh-TW'].abort}</button>
              <button 
                onClick={() => {
                  const configPayload = {
                    name: tempName || I18N['zh-TW'].new_channel,
                    niche: tempNiche || I18N['zh-TW'].general_niche,
                    concept: tempConcept,
                    language: tempLang,
                    characterProfile: tempProfile,
                    mptConfig: tempMptConfig,
                    mode: (tempProfile.name !== I18N['zh-TW'].new_agent ? 'character' : 'classic') as 'character' | 'classic' // Simple heuristic
                  };

                  if (editingChannel) {
                    setChannels(prev => prev.map(c => c.id === editingChannel.id ? { ...c, ...configPayload } : c));
                    addLog(`📝 ${I18N['zh-TW'].save_success}: ${tempName}`);
                  } else {
                    const newId = Date.now().toString();
                    setChannels([...channels, { 
                        id: newId, 
                        status: 'idle', 
                        step: 0, 
                        auth: null, 
                        autoDeploy: false,
                        weeklySchedule: { days: [], times: [] },
                        autoPilot: { enabled: false, frequency: 'daily', postTime: '20:00', days: [], engine: 'veo', mode: 'hybrid' },
                        social: { youtube: { connected: false, upload: false }, instagram: { connected: false, upload: false }, facebook: { connected: false, upload: false } },
                        ...configPayload 
                    } as any]);
                    addLog(`✨ ${I18N['zh-TW'].create_success}: ${tempName}`);
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
