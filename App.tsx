import React, { useState, useEffect, useRef } from 'react';
import { ChannelConfig, CharacterProfile } from './types';
import { CreativeStudio } from './components/CreativeStudio';

const I18N = {
  'zh-TW': {
    establish: "建立核心", edit: "頻道全域設定", engine_ready: "系統就緒", engine_active: "引擎運轉中", engine_stopped: "引擎已停止",
    manual_burst: "手動爆發", processing: "處理中...", destroy: "刪除頻道", telemetry: "系統遙測", schedule: "排程管理",
    auto_deploy: "自動部署", save: "儲存設定", abort: "取消", niche: "核心關鍵字 (搜尋用)", niche_ph: "例如: 動漫, 貓咪, 科技...",
    concept: "詳細風格與概念 (AI 生成用)", concept_ph: "例如：日本動漫的角色...", lang: "語系", name: "頻道名稱",
    core_management: "頻道管理", creative_studio: "進入創作中心", enter_studio: "啟動 MPTStudio", not_connected: "未連結",
    connected: "已連結", connect: "連結", reconnect: "重新連結", basic_info: "基本資訊", social_connect: "社群連結",
    persona_setting: "預設影片與人設", ref_sheet: "三視圖 / 設定圖", upload: "上傳", front_view: "正面", expression: "表情",
    occupation: "職業", personality: "個性", constraints: "限制 / 規範", save_success: "已更新帳號設定", create_success: "已建立新頻道",
    yt_connected: "已連結 YT", yt_not_connected: "未連結 YT", auto_on: "自動化開啟", ready: "準備就緒", analyzing: "分析趨勢中...",
    generating_video: "影片生成中...", upload_success: "發布成功！", virtual_idol: "虛擬偶像", not_set: "尚未設定詳細概念",
    no_core: "尚未建立任何頻道", connect_platforms: "連結平台", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook",
    auth_success: "YouTube 授權綁定成功。", ip_label: "IP:", new_channel: "新頻道", general_niche: "一般", new_agent: "新代理人",
    voice_settings: "預設配音設定", dashboard: "儀表板"
  },
  'en': {
    establish: "Create Channel", edit: "Global Settings", engine_ready: "Ready", engine_active: "Active", engine_stopped: "Stopped",
    manual_burst: "Burst", processing: "Processing...", destroy: "Delete", telemetry: "Telemetry", schedule: "Schedule",
    auto_deploy: "Auto", save: "Save", abort: "Cancel", niche: "Niche", niche_ph: "e.g., Tech...", concept: "Concept", concept_ph: "Details...",
    lang: "Lang", name: "Name", core_management: "Management", creative_studio: "Studio", enter_studio: "Enter MPTStudio",
    not_connected: "Not Connected", connected: "Connected", connect: "Connect", reconnect: "Reconnect", basic_info: "Basic Info",
    social_connect: "Social", persona_setting: "Default Settings", ref_sheet: "Reference", upload: "Upload", front_view: "Front",
    expression: "Expression", occupation: "Occupation", personality: "Personality", constraints: "Constraints", save_success: "Saved",
    create_success: "Created", yt_connected: "YT Ready", yt_not_connected: "YT None", auto_on: "Auto On", ready: "Ready",
    analyzing: "Analyzing...", generating_video: "Generating...", upload_success: "Success!", virtual_idol: "Idol", not_set: "Not Set",
    no_core: "No Channels", connect_platforms: "Platforms", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook",
    auth_success: "Auth Success", ip_label: "IP:", new_channel: "New Channel", general_niche: "General", new_agent: "New Agent",
    voice_settings: "Voice", dashboard: "Dashboard"
  }
};

const DEFAULT_PROFILE: CharacterProfile = {
  id: 'char_1', name: '新代理人', age: '20', occupation: '數位創作者', gender: '女性',
  personality: '好奇心強，充滿活力。', voiceTone: '輕鬆，節奏快。', contentFocus: '日常 Vlog', constraints: '不吸煙', description: '可愛女孩。', images: {}
};

const App: React.FC = () => {
  const [view, setView] = useState<'core' | 'studio'>('core');
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isEngineActive, setIsEngineActive] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);
  const [modalTab, setModalTab] = useState<'basic' | 'social' | 'persona'>('basic');
  
  const [tempProfile, setTempProfile] = useState<CharacterProfile>(DEFAULT_PROFILE);
  const [tempName, setTempName] = useState('');
  const [tempNiche, setTempNiche] = useState('');
  const [tempConcept, setTempConcept] = useState('');
  const [tempLang, setTempLang] = useState<'zh-TW' | 'en'>('zh-TW');
  const [tempMptConfig, setTempMptConfig] = useState<ChannelConfig['mptConfig']>({});
  
  // 頻道預設設定
  const [tempDefaultVideoType, setTempDefaultVideoType] = useState<'avatar' | 'product' | 'topic'>('topic');
  const [tempDefaultProductDesc, setTempDefaultProductDesc] = useState('');
  const [tempDefaultKling, setTempDefaultKling] = useState('kling-3.0');

  const [isAnyChannelRendering, setIsAnyChannelRendering] = useState(false);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const lastCheckMinute = useRef<number>(-1);

  const addLog = (msg: string) => {
    const now = new Date();
    setGlobalLog(p => [`[${now.toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));
  };

  const updateChannel = (id: string, up: Partial<ChannelConfig>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...up } : c));
  };

  useEffect(() => {
    if (editingChannel) {
        setTempProfile(editingChannel.characterProfile || DEFAULT_PROFILE);
        setTempName(editingChannel.name);
        setTempNiche(editingChannel.niche);
        setTempConcept(editingChannel.concept || '');
        setTempLang(editingChannel.language || 'zh-TW');
        setTempMptConfig(editingChannel.mptConfig || {});
        setTempDefaultVideoType(editingChannel.defaultVideoType || 'topic');
        setTempDefaultProductDesc(editingChannel.defaultProductDescription || '');
        setTempDefaultKling(editingChannel.defaultKlingModel || 'kling-3.0');
    } else {
        setTempProfile(DEFAULT_PROFILE);
        setTempName('');
        setTempNiche('');
        setTempConcept('');
        setTempLang('zh-TW');
        setTempMptConfig({});
        setTempDefaultVideoType('topic');
        setTempDefaultProductDesc('');
        setTempDefaultKling('kling-3.0');
    }
  }, [editingChannel]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: keyof CharacterProfile['images']) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setTempProfile(prev => ({ ...prev, images: { ...prev.images, [type]: reader.result as string } })); };
      reader.readAsDataURL(file);
    }
  };

  // OAuth 與 初始化
  useEffect(() => {
    const saved = localStorage.getItem('pilot_onyx_v8_data');
    if (saved) setChannels(JSON.parse(saved));

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingId = localStorage.getItem('pilot_pending_auth_id');

    if (code && pendingId && !params.get('meta_auth_success')) {
      fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
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

  if (view === 'studio') {
    return <CreativeStudio onBack={() => setView('core')} channels={channels} setChannels={setChannels} />;
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30">
      <nav className="p-8 border-b border-zinc-900 flex justify-between items-center bg-black/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black font-black italic shadow-2xl">S</div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase leading-none">ShortsPilot <span className="text-zinc-600">v9.0</span></h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex bg-zinc-900 rounded-full p-1">
                <button onClick={() => setView('core')} className="px-4 py-1 bg-zinc-800 text-white text-[9px] font-black rounded-full shadow-lg">{I18N['zh-TW'].core_management}</button>
                <button onClick={() => setView('studio')} disabled={channels.length === 0} className={`px-4 py-1 text-[9px] font-black transition-colors ${channels.length === 0 ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-500 hover:text-purple-400'}`}>{I18N['zh-TW'].enter_studio}</button>
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => { setEditingChannel(null); setModalTab('basic'); setIsModalOpen(true); }} className="px-8 py-3.5 bg-white text-black rounded-full font-black text-[10px] uppercase hover:scale-105 transition-all">
          {I18N['zh-TW'].establish}
        </button>
      </nav>

      <main className="p-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-8">
          {channels.length === 0 && <div className="py-40 text-center opacity-20 font-black italic uppercase tracking-[1em]">{I18N['zh-TW'].no_core}</div>}
          {channels.map(c => {
            const isCharacterMode = c.mode === 'character';
            return (
              <div key={c.id} className={`bg-zinc-950 border rounded-[3rem] p-10 transition-all shadow-2xl ${c.status === 'running' ? 'border-cyan-500 shadow-cyan-500/10' : 'border-zinc-900'}`}>
                <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <h2 className="text-3xl font-black italic uppercase tracking-tighter">{c.name}</h2>
                      <button onClick={() => { setEditingChannel(c); setModalTab('basic'); setIsModalOpen(true); }} className="p-2 hover:bg-zinc-900 rounded-full text-zinc-600 hover:text-white transition-colors">⚙️</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="text-[10px] font-black px-4 py-1.5 bg-purple-900/20 text-purple-400 rounded-full border border-purple-800">{c.defaultVideoType === 'product' ? '📦 產品廣告' : c.defaultVideoType === 'avatar' ? '🧑‍💼 數字人' : '📚 主題科普'}</span>
                      {c.auth ? <span className="text-[10px] font-black px-4 py-1.5 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">{I18N['zh-TW'].yt_connected}</span> : <span className="text-[10px] font-black px-4 py-1.5 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">{I18N['zh-TW'].yt_not_connected}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3 min-w-[200px]">
                    <button onClick={() => { setView('studio'); }} className="w-full py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all bg-white text-black hover:bg-purple-500 hover:text-white shadow-xl">{I18N['zh-TW'].creative_studio}</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <aside className="w-full lg:w-96 space-y-6">
          <div className="bg-zinc-950 border border-zinc-900 rounded-[2.5rem] p-8 h-[600px] overflow-hidden flex flex-col shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">{I18N['zh-TW'].telemetry}</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[10px] text-zinc-600">
              {globalLog.map((log, i) => (
                <div key={i} className={`pb-3 border-b border-zinc-900/50 leading-relaxed ${log.includes('❌') ? 'text-red-500' : log.includes('✅') ? 'text-cyan-500' : 'text-zinc-600'}`}>{log}</div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-xl flex items-center justify-center p-6 z-[200] animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-[3rem] w-full max-w-4xl space-y-6 shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">{editingChannel ? I18N['zh-TW'].edit : I18N['zh-TW'].establish}</h2>
                <div className="flex bg-zinc-900 rounded-full p-1">
                    <button onClick={() => setModalTab('basic')} className={`px-6 py-2 rounded-full text-xs font-bold uppercase transition-all ${modalTab === 'basic' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>{I18N['zh-TW'].basic_info}</button>
                    <button onClick={() => setModalTab('social')} className={`px-6 py-2 rounded-full text-xs font-bold uppercase transition-all ${modalTab === 'social' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>{I18N['zh-TW'].social_connect}</button>
                    <button onClick={() => setModalTab('persona')} className={`px-6 py-2 rounded-full text-xs font-bold uppercase transition-all ${modalTab === 'persona' ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}>{I18N['zh-TW'].persona_setting}</button>
                </div>
            </div>
            
            <div className="min-h-[400px]">
                {/* === TAB: BASIC === */}
                {modalTab === 'basic' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                        <div className="space-y-6">
                            <div><label className="text-[9px] font-black text-zinc-600 uppercase mb-3 block">{I18N['zh-TW'].name}</label><input value={tempName} onChange={e => setTempName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500" /></div>
                            <div><label className="text-[9px] font-black text-cyan-600 uppercase mb-3 block">{I18N['zh-TW'].niche}</label><input value={tempNiche} onChange={e => setTempNiche(e.target.value)} placeholder={I18N['zh-TW'].niche_ph} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-sm font-bold outline-none focus:border-cyan-500" /></div>
                            <div><label className="text-[9px] font-black text-zinc-600 uppercase mb-3 block">{I18N['zh-TW'].lang}</label><select value={tempLang} onChange={e => setTempLang(e.target.value as any)} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-sm font-bold outline-none"><option value="zh-TW">繁體中文</option><option value="en">English</option></select></div>
                        </div>
                        <div className="space-y-6">
                            <div><label className="text-[9px] font-black text-purple-400 uppercase mb-3 block">{I18N['zh-TW'].concept}</label><textarea value={tempConcept} onChange={e => setTempConcept(e.target.value)} placeholder={I18N['zh-TW'].concept_ph} className="w-full h-64 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl text-xs leading-relaxed outline-none focus:border-purple-500 resize-none" /></div>
                        </div>
                    </div>
                )}

                {/* 🚀 完整還原：SOCIAL TAB (YT/IG/FB 授權介面) */}
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

                {/* === TAB: PERSONA & DEFAULTS === */}
                {modalTab === 'persona' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in">
                        <div className="md:col-span-5 space-y-6">
                            <div className="bg-purple-900/10 p-6 rounded-2xl border border-purple-500/20 space-y-5">
                                <div>
                                    <label className="text-[10px] font-bold text-purple-400 uppercase block mb-3">🎬 頻道預設：影片核心類型</label>
                                    <select 
                                        value={tempDefaultVideoType} 
                                        onChange={e => setTempDefaultVideoType(e.target.value as any)}
                                        className="w-full bg-black border border-purple-500/30 p-3 rounded-xl text-sm font-bold text-white outline-none"
                                    >
                                        <option value="topic">📚 主題科普 (Veo + 素材庫)</option>
                                        <option value="product">📦 產品實拍廣告 (Kling 不變形)</option>
                                        <option value="avatar">🧑‍💼 數字人演講 (HeyGen)</option>
                                    </select>
                                </div>
                                {tempDefaultVideoType === 'product' && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div><label className="text-[10px] font-bold text-emerald-400 uppercase block mb-2">預設 Kling 模型等級</label><select value={tempDefaultKling} onChange={e => setTempDefaultKling(e.target.value)} className="w-full bg-black border border-emerald-500/30 p-2.5 rounded-lg text-xs text-white outline-none"><option value="kling-3.0">Kling 3.0 (最高精準度)</option><option value="kling-2.6-pro">Kling 2.6 Pro</option><option value="kling-2.5-turbo">Kling 2.5 Turbo (最省錢)</option></select></div>
                                        <div><label className="text-[10px] font-bold text-emerald-400 block mb-2">預設產品防呆描述 (全局套用)</label><textarea value={tempDefaultProductDesc} onChange={e => setTempDefaultProductDesc(e.target.value)} placeholder="例如：這是一罐板機式噴霧，必須用食指扣動板機噴灑。" className="w-full bg-black border border-emerald-500/30 p-3 rounded-lg text-xs h-20 outline-none resize-none" /></div>
                                    </div>
                                )}
                                {tempDefaultVideoType === 'avatar' && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div><label className="text-[10px] font-bold text-blue-400 uppercase block mb-2">專屬 HeyGen Avatar ID</label><input value={tempMptConfig?.heygenAvatarId || ''} onChange={e => setTempMptConfig({...tempMptConfig, heygenAvatarId: e.target.value})} placeholder="輸入 ID..." className="w-full bg-black border border-blue-500/30 p-2.5 rounded-lg text-xs outline-none" /></div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-zinc-900/30 p-6 rounded-2xl border border-zinc-800 space-y-4">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase block">預設配音引擎</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><select value={tempMptConfig?.ttsEngine || 'edge'} onChange={e => setTempMptConfig({...tempMptConfig, ttsEngine: e.target.value as any})} className="w-full bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-xs font-bold outline-none"><option value="edge">Edge TTS (免費)</option><option value="elevenlabs">ElevenLabs (付費)</option></select></div>
                                    {tempMptConfig?.ttsEngine === 'elevenlabs' ? (
                                        <input value={tempMptConfig?.elevenLabsVoiceId || ''} onChange={e => setTempMptConfig({...tempMptConfig, elevenLabsVoiceId: e.target.value})} placeholder="Voice ID" className="w-full bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-xs font-bold outline-none" />
                                    ) : (
                                        <select value={tempMptConfig?.voiceId || 'zh-TW-HsiaoChenNeural'} onChange={e => setTempMptConfig({...tempMptConfig, voiceId: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-xs font-bold outline-none"><option value="zh-TW-HsiaoChenNeural">HsiaoChen (女)</option><option value="zh-TW-YunJheNeural">YunJhe (男)</option></select>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-7 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].name}</label><input value={tempProfile.name} onChange={e => setTempProfile({...tempProfile, name: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-sm font-bold outline-none" /></div>
                                <div><label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].occupation}</label><input value={tempProfile.occupation || ''} onChange={e => setTempProfile({...tempProfile, occupation: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-sm font-bold outline-none" /></div>
                            </div>
                            <div><label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">{I18N['zh-TW'].personality}</label><textarea value={tempProfile.personality} onChange={e => setTempProfile({...tempProfile, personality: e.target.value})} className="w-full h-20 bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-xs leading-relaxed outline-none resize-none" /></div>
                            <div><label className="text-[10px] font-bold text-red-500 uppercase block mb-2">{I18N['zh-TW'].constraints}</label><textarea value={tempProfile.constraints} onChange={e => setTempProfile({...tempProfile, constraints: e.target.value})} className="w-full h-16 bg-red-900/10 border border-red-900/30 p-3 rounded-xl text-xs text-red-200 leading-relaxed outline-none resize-none" /></div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-6 pt-6 border-t border-zinc-900">
              {editingChannel && (<button onClick={() => { if (confirm("確定刪除？")) { setChannels(prev => prev.filter(c => c.id !== editingChannel.id)); setIsModalOpen(false); } }} className="flex-1 text-[11px] font-black uppercase text-red-600 hover:text-red-400 transition-colors">{I18N['zh-TW'].destroy}</button>)}
              <button onClick={() => setIsModalOpen(false)} className="flex-1 text-[11px] font-black uppercase text-zinc-600 hover:text-white transition-colors">{I18N['zh-TW'].abort}</button>
              <button 
                onClick={() => {
                  const configPayload = {
                    name: tempName || I18N['zh-TW'].new_channel, niche: tempNiche || I18N['zh-TW'].general_niche, concept: tempConcept,
                    language: tempLang, characterProfile: tempProfile, mptConfig: tempMptConfig,
                    defaultVideoType: tempDefaultVideoType, defaultProductDescription: tempDefaultProductDesc, defaultKlingModel: tempDefaultKling,
                    mode: tempDefaultVideoType === 'avatar' ? 'character' : 'classic' 
                  };

                  if (editingChannel) {
                    setChannels(prev => prev.map(c => c.id === editingChannel.id ? { ...c, ...configPayload } as any : c));
                  } else {
                    const newId = Date.now().toString();
                    setChannels([...channels, { 
                        id: newId, status: 'idle', step: 0, auth: null, 
                        autoPilot: { enabled: false, frequency: 'daily', postTime: '20:00', days: [], videoType: tempDefaultVideoType, mode: 'hybrid' },
                        social: { youtube: { connected: false, upload: false }, instagram: { connected: false, upload: false }, facebook: { connected: false, upload: false } },
                        ...configPayload 
                    } as any]);
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
