
import React, { useState, useRef, useEffect } from 'react';
import { CharacterProfile, ChannelConfig } from '../types';

interface CharacterStudioProps {
  onBack: () => void;
  channels: ChannelConfig[];
  setChannels: React.Dispatch<React.SetStateAction<ChannelConfig[]>>;
}

const VIBES = [
  { 
    id: 'cute_dance', 
    label: 'Cute / Aegyo Dance', 
    prompt: "performing a cute viral tiktok dance, vertical full body shot, shy smile, making heart gestures, rhythmic swaying, soft lighting, bedroom background, 4k." 
  },
  { 
    id: 'kpop_dynamic', 
    label: 'K-Pop Dynamic', 
    prompt: "performing a confident K-pop dance move, vertical framing, sharp hand movements, hair flip, dynamic low angle, neon city night background, stylish outfit." 
  },
  { 
    id: 'vlog_date', 
    label: 'POV: Date Vlog', 
    prompt: "POV shot holding hands with camera (boyfriend perspective), walking forward then turning back to smile sweetly, vertical video style, golden hour sunlight, park background, cinematic vlog." 
  },
  { 
    id: 'outfit_check', 
    label: 'OOTD / Outfit Check', 
    prompt: "doing a fashion model spin to show off outfit, vertical full body shot, posing confidently, high contrast studio lighting, 4k detailed texture, looking at camera." 
  }
];

export const CharacterStudio: React.FC<CharacterStudioProps> = ({ onBack, channels, setChannels }) => {
  // 嘗試從 LocalStorage 載入上次的設定
  const [character, setCharacter] = useState<CharacterProfile>({
    id: 'char_1',
    name: 'New Character',
    description: 'A cute Korean girl, pink bob hair, white sweater, blue jeans, soft skin texture.',
    images: {}
  });

  const [selectedVibe, setSelectedVibe] = useState(VIBES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Auth & Schedule State
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState('18:00');
  const [autoDeploy, setAutoDeploy] = useState(false);

  // Refs for file inputs
  const frontInputRef = useRef<HTMLInputElement>(null);
  const fullInputRef = useRef<HTMLInputElement>(null);
  const sideInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'fullBody' | 'side') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharacter(prev => ({
          ...prev,
          images: { ...prev.images, [type]: reader.result as string }
        }));
        addLog(`📸 [${type}] 參考圖已載入`);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    addLog("📋 Prompt 已複製到剪貼簿！");
  };

  const handleGenerate = async () => {
    if (!character.images.front && !character.images.fullBody && !character.images.side) {
      alert("請至少上傳一張參考圖 (推薦：正面圖)！");
      return;
    }
    
    setIsGenerating(true);
    setGeneratedVideo(null);
    setLogs([]);
    addLog("🚀 開始生成虛擬偶像影片 (9:16)...");
    
    // 收集所有有效圖片
    const validImages = [];
    if (character.images.front) validImages.push({ type: 'front', data: character.images.front });
    if (character.images.fullBody) validImages.push({ type: 'full', data: character.images.fullBody });
    if (character.images.side) validImages.push({ type: 'side', data: character.images.side });
    
    addLog(`ℹ️ 使用 ${validImages.length} 張參考圖進行混合`);

    try {
      const response = await fetch('/api/character_pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          vibe: selectedVibe
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      
      addLog("✨ Veo 渲染完成！");
      setGeneratedVideo(data.videoUrl);
    } catch (e: any) {
      addLog(`❌ 錯誤: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpload = async () => {
    if (!generatedVideo || !selectedChannelId) return;
    const targetChannel = channels.find(c => c.id === selectedChannelId);
    if (!targetChannel?.auth) {
      alert("請先選擇已授權的頻道！");
      return;
    }

    setIsUploading(true);
    addLog("☁️ 正在上傳至 YouTube Shorts...");

    try {
      const response = await fetch('/api/upload_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: generatedVideo,
          auth: targetChannel.auth,
          metadata: {
            title: `${character.name} - ${selectedVibe.label} #shorts`,
            desc: `Generated by Virtual Idol Studio. Character: ${character.name} #AI #Veo`
          }
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      addLog(`✅ 上傳成功！Video ID: ${data.videoId}`);
      window.open(data.url, '_blank');
    } catch (e: any) {
      addLog(`❌ 上傳失敗: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveAutomation = () => {
    // 建立或更新一個專門跑這個角色的 Channel Config
    const newChannelConfig: ChannelConfig = {
      id: `char_auto_${Date.now()}`,
      name: `[Auto] ${character.name}`,
      niche: "Virtual Idol",
      language: 'zh-TW',
      status: 'idle',
      auth: selectedChannelId ? channels.find(c => c.id === selectedChannelId)?.auth : null,
      autoDeploy: autoDeploy,
      mode: 'character', // 標記為角色模式
      characterProfile: character,
      targetVibeId: selectedVibe.id,
      weeklySchedule: {
        days: [0, 1, 2, 3, 4, 5, 6],
        times: [scheduleTime]
      }
    };

    setChannels(prev => [...prev, newChannelConfig]);
    addLog(`💾 自動化任務已儲存至核心列表！`);
    alert("任務已儲存！請回到 CORE 頁面查看並確保引擎已啟動。");
  };

  // 如果有透過 OAuth 回來，自動選取
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      const valid = channels.find(c => c.auth);
      if (valid) setSelectedChannelId(valid.id);
    }
  }, [channels]);

  // 動態生成 Prompt 的數據結構
  const desc = character.description || 'A cute girl';
  const IMAGE_SLOTS = [
    { 
      type: 'front', 
      label: '1. Face / Front', 
      ref: frontInputRef, 
      img: character.images.front,
      // 使用真實的「正面」範例圖片
      exampleImg: "https://duk.tw/qQcmo5.jpg", 
      promptTitle: "Generate Portrait",
      prompt: `Generate a photorealistic portrait of ${desc}, Medium shot (waist up), facing camera directly, eye contact, soft studio lighting, 8k resolution, raw photo.` 
    },
    { 
      type: 'fullBody', 
      label: '2. Full Body', 
      ref: fullInputRef, 
      img: character.images.fullBody,
      // 使用真實的「全身」範例圖片
      exampleImg: "https://duk.tw/YWwlZx.jpg",
      promptTitle: "Generate Full Body",
      prompt: `Generate a full-body fashion photo of ${desc}, Wide angle full body shot, standing straight, facing forward, entire body visible from head to toe, 4k.` 
    },
    { 
      type: 'side', 
      label: '3. Character Sheet', 
      ref: sideInputRef, 
      img: character.images.side,
      // 使用真實的「三視圖」範例圖片
      exampleImg: "https://duk.tw/pYDk21.jpg",
      promptTitle: "Generate 3-View Sheet",
      prompt: `Create a character reference sheet for ${desc}, Split screen image showing 3 views: Front, Side profile, Back view. Neutral pose, plain background.` 
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-purple-900/30 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-zinc-800 transition-colors">
            ←
          </button>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              VIRTUAL IDOL STUDIO
            </h1>
            <p className="text-xs text-purple-400/60 font-mono tracking-widest uppercase">Multi-Angle Reference Engine</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Character & Input */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* 1. Character Identity */}
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
            <h2 className="text-xs font-black text-purple-500 uppercase tracking-widest mb-2">1. Character Identity</h2>
            <input 
              type="text" 
              value={character.name}
              onChange={e => setCharacter({...character, name: e.target.value})}
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm font-bold focus:border-purple-500 outline-none"
              placeholder="Name"
            />
            <textarea 
              value={character.description}
              onChange={e => setCharacter({...character, description: e.target.value})}
              className="w-full h-20 bg-black border border-zinc-800 p-3 rounded-xl text-xs text-zinc-400 focus:border-purple-500 outline-none resize-none"
              placeholder="Physical description (e.g. Pink bob hair, white sweater...)"
            />

            {/* 3-Slot Image Uploader with Copyable Prompts */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {IMAGE_SLOTS.map((slot) => (
                <div key={slot.type} className="flex flex-col gap-2">
                  {/* Upload Area */}
                  <div 
                    onClick={() => slot.ref.current?.click()}
                    className={`aspect-[3/4] w-full rounded-xl border border-dashed flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group transition-all ${slot.img ? 'border-purple-500/50' : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/30'}`}
                  >
                    {/* Render Example or Uploaded Image */}
                    {slot.img ? (
                      <img src={slot.img} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <>
                        {/* Example Image Background */}
                        {slot.exampleImg && (
                          <img src={slot.exampleImg} className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale group-hover:grayscale-0 group-hover:opacity-50 transition-all pointer-events-none" />
                        )}
                        <div className="z-10 flex flex-col items-center drop-shadow-md">
                          <div className="text-lg mb-1 shadow-black text-white">📷</div>
                          <div className="text-[8px] font-bold text-white/80 uppercase text-center tracking-wider">{slot.label}</div>
                        </div>
                      </>
                    )}
                    <input ref={slot.ref} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, slot.type as any)} />
                  </div>

                  {/* Copy Prompt Area */}
                  <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-lg p-2 flex flex-col gap-1 group/prompt hover:border-purple-500/30 transition-colors h-16 justify-between">
                    <div className="flex justify-between items-center">
                      <span className="text-[7px] font-black text-zinc-500 uppercase truncate max-w-[50px]">{slot.promptTitle}</span>
                      <button 
                        onClick={() => handleCopyPrompt(slot.prompt)}
                        className="text-[7px] text-purple-400 hover:text-white font-bold bg-purple-900/20 px-1.5 py-0.5 rounded transition-colors"
                      >
                        COPY
                      </button>
                    </div>
                    <div className="text-[6px] text-zinc-600 font-mono leading-tight line-clamp-2 group-hover/prompt:text-zinc-400 select-all">
                      {slot.prompt}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-zinc-600 text-center mt-2">*Upload 3 angles for best Veo results. Description auto-fills prompt.</p>
          </div>

          {/* 2. Vibe & Auth */}
          <div className="grid grid-cols-2 gap-4">
             {/* Vibe */}
             <div className="col-span-2 bg-zinc-950 border border-zinc-800 p-5 rounded-[2rem]">
                <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">2. Action Vibe</h2>
                <select 
                  className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs font-bold outline-none"
                  onChange={(e) => setSelectedVibe(VIBES.find(v => v.id === e.target.value) || VIBES[0])}
                >
                  {VIBES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
             </div>

             {/* Auth Selector */}
             <div className="col-span-2 bg-zinc-950 border border-zinc-800 p-5 rounded-[2rem]">
                <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">3. Target Channel</h2>
                {channels.some(c => c.auth) ? (
                  <select 
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs font-bold text-green-500 outline-none"
                  >
                    <option value="">Select Connected Channel...</option>
                    {channels.filter(c => c.auth).map(c => (
                      <option key={c.id} value={c.id}>✅ {c.name}</option>
                    ))}
                  </select>
                ) : (
                  <button 
                    onClick={() => {
                       const tempId = 'temp_studio_auth';
                       localStorage.setItem('pilot_pending_auth_id', tempId);
                       // Add a temp channel to accept the token if needed, or just redirect
                       setChannels(p => [...p, { id: tempId, name: 'Studio Auth', niche: 'General', auth: null, status: 'idle', autoDeploy: false }]);
                       window.location.href='/api/auth?action=url'; 
                    }}
                    className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase hover:bg-red-500"
                  >
                    Connect YouTube
                  </button>
                )}
             </div>
          </div>

          {/* Generate Button */}
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-6 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl ${isGenerating ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-[1.02] hover:shadow-purple-500/25'}`}
          >
            {isGenerating ? 'Veo is Thinking...' : 'Generate Preview'}
          </button>

        </div>

        {/* Right Column: Preview & Actions */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-[3rem] p-4 flex items-center justify-center relative overflow-hidden min-h-[500px]">
            {generatedVideo ? (
              <video src={generatedVideo} controls autoPlay loop className="h-full w-full object-contain rounded-[2rem] shadow-2xl" />
            ) : (
              <div className="text-center space-y-4 opacity-30">
                <div className="text-6xl animate-pulse">🎬</div>
                <div className="text-sm font-black uppercase tracking-widest">Veo 3.1 Preview</div>
              </div>
            )}
             
            {/* Logs */}
            {isGenerating && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-10 p-8">
                 <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <div className="font-mono text-[10px] text-purple-300 space-y-1 text-center">
                    {logs.slice(0, 5).map((l, i) => <div key={i}>{l}</div>)}
                 </div>
              </div>
            )}
          </div>

          {/* Post-Generation Actions */}
          <div className="grid grid-cols-2 gap-4">
             {/* Direct Upload */}
             <button 
               disabled={!generatedVideo || isUploading || !selectedChannelId}
               onClick={handleUpload}
               className={`p-6 rounded-[2rem] border transition-all flex flex-col items-center justify-center gap-2 ${generatedVideo ? 'bg-white text-black border-white hover:bg-zinc-200' : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'}`}
             >
               <div className="text-xl">☁️</div>
               <div className="text-[10px] font-black uppercase tracking-widest">{isUploading ? 'Uploading...' : 'Upload to YouTube'}</div>
             </button>

             {/* Automation Schedule */}
             <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-[2rem] flex flex-col justify-between">
               <div className="flex justify-between items-start mb-4">
                 <div className="text-[10px] font-black text-zinc-500 uppercase">Automation</div>
                 <input 
                   type="checkbox" 
                   checked={autoDeploy} 
                   onChange={e => setAutoDeploy(e.target.checked)}
                   className="w-5 h-5 accent-purple-500" 
                 />
               </div>
               <div className="flex gap-2 mb-3">
                 <input 
                   type="time" 
                   value={scheduleTime} 
                   onChange={e => setScheduleTime(e.target.value)}
                   className="bg-black border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono text-white w-full"
                 />
               </div>
               <button 
                 onClick={handleSaveAutomation}
                 className="w-full py-2 bg-purple-900/30 text-purple-300 border border-purple-500/30 rounded-lg text-[9px] font-black uppercase hover:bg-purple-900/50"
               >
                 Save Task
               </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
