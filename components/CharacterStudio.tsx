
import React, { useState, useRef, useEffect } from 'react';
import { CharacterProfile, ChannelConfig } from '../types';

interface CharacterStudioProps {
  onBack: () => void;
  channels: ChannelConfig[];
  setChannels: React.Dispatch<React.SetStateAction<ChannelConfig[]>>;
}

// 升級版：情境分類資料庫 (中文化)
const VIBE_CATEGORIES: Record<string, { id: string; label: string; prompt: string }[]> = {
  '表演': [
    { id: 'cute_dance', label: '可愛舞蹈 (TikTok)', prompt: "performing a viral cute tiktok dance, rhythmic bouncing, making small heart gestures near cheek. Soft pastel bedroom background." },
    { id: 'kpop_cool', label: '酷帥 K-Pop 舞步', prompt: "performing a sharp and powerful K-pop choreography, hair flowing naturally with movement. Confident gaze, slight smirk. Neon city street background." },
    { id: 'idol_singing', label: '舞台演唱', prompt: "holding a microphone, singing emotionally with eyes closed then opening to look at camera. Stage lights, particles floating, concert atmosphere." },
  ],
  '生活': [
    { id: 'cafe_date', label: '咖啡廳約會', prompt: "sitting at a cafe table, holding a latte, blowing on it gently, looking at camera and smiling shyly. Sunny window background, cozy vibes." },
    { id: 'study_vlog', label: '讀書 / 工作', prompt: "sitting at a desk, writing in a notebook, tucking hair behind ear, focused expression, lo-fi aesthetic, warm desk lamp lighting." },
    { id: 'eating', label: '吃播 / 進食', prompt: "holding a delicious burger/dessert, taking a small bite, eyes widening in delight, looking at camera and nodding. Restaurant background." },
  ],
  '電影感': [
    { id: 'slow_wind', label: '微風吹拂 (慢動作)', prompt: "standing still, wind blowing through hair messily but beautifully. Melancholic expression, looking into distance then turning to camera. Sunset rooftop, golden hour, cinematic film grain." },
    { id: 'rain_window', label: '雨天氛圍', prompt: "looking out a rainy window, finger tracing a raindrop on the glass, turning to look at camera with a sad smile. Blue hour lighting, reflective glass." },
    { id: 'cyberpunk', label: '賽博龐克霓虹', prompt: "standing in a futuristic alleyway, neon signs reflecting on face. High contrast lighting, rain falling, looking cool and mysterious." },
  ],
  '互動': [
    { id: 'waving', label: '打招呼 / 揮手', prompt: "waving hand enthusiastically at the camera, mouthing 'Hello!', bright smile, friendly and welcoming. Park background." },
    { id: 'pointing', label: '手指指示 (文字疊加)', prompt: "standing to the side, pointing finger at the empty space (where text will be), nodding approvingly. useful for shorts overlays. Plain background." },
    { id: 'scolding', label: '生氣 / 責罵', prompt: "crossing arms, puffing cheeks, looking at camera with a cute angry expression (tsundere style), stomping foot slightly." },
  ]
};

// 鏡位選擇中文化
const CAMERA_ANGLES = [
  { id: 'close_up', label: '特寫 (Face/ASMR)', desc: '聚焦於臉部與表情' },
  { id: 'waist_up', label: '半身 (Vlog/訪談)', desc: '標準半身鏡頭' },
  { id: 'full_body', label: '全身 (OOTD/舞蹈)', desc: '展示全身穿搭與動作' }
];

interface VideoSegment {
  id: string;
  url: string;
  prompt: string;
}

export const CharacterStudio: React.FC<CharacterStudioProps> = ({ onBack, channels, setChannels }) => {
  const [character, setCharacter] = useState<CharacterProfile>({
    id: 'char_1',
    name: '新角色',
    description: 'A cute Korean girl, pink bob hair, white sweater, blue jeans, soft skin texture.',
    images: {}
  });

  // State for Scenario Director
  const [activeCategory, setActiveCategory] = useState<string>('表演');
  const [selectedVibe, setSelectedVibe] = useState(VIBE_CATEGORIES['表演'][0]);
  const [customAction, setCustomAction] = useState('');
  const [cameraAngle, setCameraAngle] = useState(CAMERA_ANGLES[1]); // Default Waist-up

  // State for Style Override
  const [customOutfit, setCustomOutfit] = useState('');
  const [customHair, setCustomHair] = useState('');
  
  // System State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Timeline / Video State
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState(0);
  
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  
  // Automation State
  const [scheduleTime, setScheduleTime] = useState('18:00');
  const [autoDeploy, setAutoDeploy] = useState(false);

  // Refs
  const frontInputRef = useRef<HTMLInputElement>(null);
  const fullInputRef = useRef<HTMLInputElement>(null);
  const sideInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p]);

  // 初始化：選擇第一個可用頻道
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      const valid = channels.find(c => c.auth);
      if (valid) {
        setSelectedChannelId(valid.id);
        // 同步頻道的排程設定
        if (valid.weeklySchedule && valid.weeklySchedule.times.length > 0) {
           setScheduleTime(valid.weeklySchedule.times[0]);
        }
        setAutoDeploy(valid.autoDeploy || false);
      } else {
        // 如果沒有授權頻道，預設選第一個
        setSelectedChannelId(channels[0].id);
      }
    }
  }, [channels]);

  // 切換頻道時同步設定
  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cid = e.target.value;
    setSelectedChannelId(cid);
    const target = channels.find(c => c.id === cid);
    if (target) {
        if (target.weeklySchedule && target.weeklySchedule.times.length > 0) {
            setScheduleTime(target.weeklySchedule.times[0]);
        }
        setAutoDeploy(target.autoDeploy || false);
    }
  };

  const handleSaveAutomation = () => {
     if (!selectedChannelId) return;
     
     setChannels(prev => prev.map(c => {
         if (c.id === selectedChannelId) {
             return {
                 ...c,
                 autoDeploy: autoDeploy,
                 weeklySchedule: {
                     days: [0, 1, 2, 3, 4, 5, 6], // 預設每天
                     times: [scheduleTime]
                 },
                 mode: 'character', // 標記為角色模式
                 characterProfile: character // 儲存當前角色設定到頻道
             };
         }
         return c;
     }));
     alert(`✅ 排程設定已儲存！\n頻道: ${channels.find(c => c.id === selectedChannelId)?.name}\n時間: 每天 ${scheduleTime}\n自動發布: ${autoDeploy ? '開啟' : '關閉'}`);
  };

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

  // 核心：擷取最後一幀
  const captureLastFrame = async (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.currentTime = 10000; // Seek to end (browser clamps to duration)
      
      video.onloadedmetadata = () => {
        video.currentTime = video.duration - 0.1; // Seek to almost end
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };

      video.onerror = (e) => reject(e);
    });
  };

  const handleGenerate = async (isExtension = false) => {
    if (!character.images.front && !character.images.fullBody && !character.images.side) {
      alert("請至少上傳一張參考圖 (推薦：正面圖)！");
      return;
    }
    
    setIsGenerating(true);
    // 如果是全新生成，清空片段；如果是續寫，保留片段
    if (!isExtension) {
      setSegments([]);
      setCurrentPlayingIndex(0);
    }

    setLogs([]);
    addLog(isExtension ? "🚀 正在續寫下一段 (Extension)..." : "🚀 開始生成 Scene 1...");

    let startImage = null;
    if (isExtension && segments.length > 0) {
      try {
        addLog("🎞️ 正在擷取上一段影片的最後一幀...");
        const lastUrl = segments[segments.length - 1].url;
        startImage = await captureLastFrame(lastUrl);
        addLog("✅ 擷取成功，將作為下一段的起始畫面 (無縫轉場)");
      } catch (e) {
        addLog("⚠️ 無法擷取最後一幀，將進行獨立生成");
      }
    }
    
    if (customAction) addLog(`🎬 動作指令: ${customAction}`);
    else addLog(`🎬 動作指令: ${selectedVibe.label}`);

    try {
      const response = await fetch('/api/character_pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character,
          vibe: {
             ...selectedVibe,
             prompt: customAction || selectedVibe.prompt
          },
          cameraAngle: cameraAngle.id,
          customOutfit, 
          customHair,
          startImage // 傳遞給後端
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      
      addLog("✨ Veo 渲染完成！");
      const newSegment = {
        id: `seg_${Date.now()}`,
        url: data.videoUrl,
        prompt: customAction || selectedVibe.label
      };
      
      setSegments(prev => [...prev, newSegment]);
      
      // Auto play the new segment
      if (isExtension) {
        setCurrentPlayingIndex(prev => prev + 1);
      }
      
    } catch (e: any) {
      addLog(`❌ 錯誤: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 播放器邏輯：自動播放下一段
  const handleVideoEnded = () => {
    if (currentPlayingIndex < segments.length - 1) {
      setCurrentPlayingIndex(p => p + 1);
    } else {
      // Loop whole sequence
      setCurrentPlayingIndex(0);
    }
  };

  const handleUpload = async () => {
    if (segments.length === 0 || !selectedChannelId) return;
    const targetChannel = channels.find(c => c.id === selectedChannelId);
    if (!targetChannel?.auth) {
      alert("請先選擇已授權的頻道！請返回核心管理介面進行連結。");
      return;
    }

    setIsUploading(true);

    let finalVideoUrl = segments[0].url;

    // 自動拼接邏輯
    if (segments.length > 1) {
       addLog(`🔄 檢測到 ${segments.length} 個片段，開始自動拼接 (FFmpeg)...`);
       try {
         const stitchRes = await fetch('/api/stitch_videos', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ segments: segments.map(s => s.url) })
         });
         const stitchData = await stitchRes.json();
         if (!stitchData.success) throw new Error(stitchData.error);
         
         finalVideoUrl = stitchData.mergedVideoUrl;
         addLog(`✅ 影片拼接完成 (大小: ${(finalVideoUrl.length / 1024 / 1024).toFixed(2)} MB)`);
       } catch (e: any) {
         addLog(`❌ 拼接失敗: ${e.message}。將僅上傳最後一段。`);
         finalVideoUrl = segments[segments.length - 1].url;
       }
    }

    addLog("☁️ 正在上傳至 YouTube Shorts...");

    try {
      const response = await fetch('/api/upload_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: finalVideoUrl,
          auth: targetChannel.auth,
          metadata: {
            title: `${character.name} - ${customAction ? 'Custom' : selectedVibe.label} #shorts`,
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

  const desc = character.description || 'A cute girl';
  
  // 恢復示範圖邏輯
  const IMAGE_SLOTS = [
    { 
      type: 'front', 
      label: '1. 正面 (臉部識別)', 
      ref: frontInputRef, 
      img: character.images.front,
      exampleImg: "https://duk.tw/qQcmo5.jpg", 
    },
    { 
      type: 'fullBody', 
      label: '2. 全身 (服裝參考)', 
      ref: fullInputRef, 
      img: character.images.fullBody,
      exampleImg: "https://duk.tw/YWwlZx.jpg", 
    },
    { 
      type: 'side', 
      label: '3. 側面 / 三視圖', 
      ref: sideInputRef, 
      img: character.images.side,
      exampleImg: "https://duk.tw/pYDk21.jpg", 
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-8 border-b border-purple-900/30 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-zinc-800 transition-colors">←</button>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              虛擬偶像工作室
            </h1>
            <p className="text-xs text-purple-400/60 font-mono tracking-widest uppercase">導演模式 v3.0</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* 1. 發布頻道與排程設定 (Restored) */}
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
             <div className="flex justify-between items-center">
                <h2 className="text-xs font-black text-green-500 uppercase tracking-widest">發布頻道 & 排程</h2>
                {channels.find(c => c.id === selectedChannelId)?.auth ? (
                    <span className="text-[9px] px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full border border-green-800">已連結 YouTube</span>
                ) : (
                    <span className="text-[9px] px-2 py-0.5 bg-red-900/30 text-red-400 rounded-full border border-red-800">未連結 (請至核心管理)</span>
                )}
             </div>
             
             <select 
               value={selectedChannelId} 
               onChange={handleChannelChange}
               className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm font-bold outline-none"
             >
                {channels.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.niche})</option>
                ))}
             </select>

             <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="text-[9px] text-zinc-500 font-bold block mb-1">每日發布時間</label>
                   <input 
                     type="time" 
                     value={scheduleTime}
                     onChange={(e) => setScheduleTime(e.target.value)}
                     className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-center font-mono"
                   />
                </div>
                <div>
                   <label className="text-[9px] text-zinc-500 font-bold block mb-1">自動發布 (Auto-Deploy)</label>
                   <button 
                     onClick={() => setAutoDeploy(!autoDeploy)}
                     className={`w-full py-2 rounded-lg text-xs font-black transition-all ${autoDeploy ? 'bg-cyan-500 text-black' : 'bg-zinc-900 text-zinc-600'}`}
                   >
                      {autoDeploy ? '已開啟 (ON)' : '已關閉 (OFF)'}
                   </button>
                </div>
             </div>
             <button 
               onClick={handleSaveAutomation}
               className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[10px] rounded-lg font-bold uppercase tracking-wider"
             >
                儲存自動化設定
             </button>
          </div>

          {/* 2. Character Identity (With Example Images Restored) */}
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
            <h2 className="text-xs font-black text-purple-500 uppercase tracking-widest mb-2">角色設定 (Identity)</h2>
            <input 
              type="text" 
              value={character.name}
              onChange={e => setCharacter({...character, name: e.target.value})}
              className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm font-bold focus:border-purple-500 outline-none"
              placeholder="角色名稱 (例如: 小美)"
            />
             <div className="grid grid-cols-3 gap-3 mt-4">
              {IMAGE_SLOTS.map((slot) => (
                <div key={slot.type} className="flex flex-col gap-2">
                  <div 
                    onClick={() => slot.ref.current?.click()}
                    className={`aspect-[3/4] w-full rounded-xl border border-dashed flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group transition-all ${slot.img ? 'border-purple-500/50' : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/30'}`}
                  >
                    {slot.img ? (
                      <img src={slot.img} className={`absolute inset-0 w-full h-full object-cover z-20`} />
                    ) : (
                      <>
                        {/* 示範圖 (Example Image) 背景 */}
                        <img src={slot.exampleImg} className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale group-hover:grayscale-0 group-hover:opacity-50 transition-all z-0" />
                        <div className="z-10 flex flex-col items-center drop-shadow-md bg-black/50 p-2 rounded-lg backdrop-blur-sm">
                          <div className="text-lg mb-1 shadow-black text-white">📷</div>
                          <div className="text-[8px] font-bold text-white uppercase text-center tracking-wider">{slot.label}</div>
                        </div>
                      </>
                    )}
                    <input ref={slot.ref} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, slot.type as any)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Style Override */}
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
            <h2 className="text-xs font-black text-pink-500 uppercase tracking-widest mb-2">風格調整 (Override)</h2>
            <div className="grid grid-cols-2 gap-4">
               <input 
                 type="text" 
                 value={customOutfit}
                 onChange={e => setCustomOutfit(e.target.value)}
                 placeholder="更換服裝 (例如: 紅洋裝)"
                 className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs text-white focus:border-pink-500 outline-none"
               />
               <input 
                 type="text" 
                 value={customHair}
                 onChange={e => setCustomHair(e.target.value)}
                 placeholder="更換髮型 (例如: 金髮)"
                 className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs text-white focus:border-pink-500 outline-none"
               />
            </div>
          </div>

          {/* 4. Scenario Director */}
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
             <h2 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-2">導演指令 (Scenario)</h2>
             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
               {Object.keys(VIBE_CATEGORIES).map(cat => (
                 <button 
                   key={cat}
                   onClick={() => setActiveCategory(cat)}
                   className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/50' : 'bg-zinc-900 text-zinc-500 hover:text-white'}`}
                 >
                   {cat}
                 </button>
               ))}
             </div>
             <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
               {VIBE_CATEGORIES[activeCategory].map(v => (
                 <button
                   key={v.id}
                   onClick={() => { setSelectedVibe(v); setCustomAction(''); }} 
                   className={`p-3 rounded-xl text-left border transition-all ${selectedVibe.id === v.id && !customAction ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                 >
                   <div className="text-[10px] font-black uppercase truncate">{v.label}</div>
                 </button>
               ))}
             </div>
             <div className="relative">
                <textarea 
                  value={customAction}
                  onChange={e => setCustomAction(e.target.value)}
                  placeholder="輸入自定義動作描述..."
                  className={`w-full h-20 bg-black border p-3 rounded-xl text-xs outline-none transition-all resize-none ${customAction ? 'border-cyan-500 text-white' : 'border-zinc-800 text-zinc-500'}`}
                />
             </div>
             <div>
                <label className="text-[9px] text-zinc-500 uppercase font-bold block mb-2">鏡位選擇 (Camera Angle)</label>
                <div className="grid grid-cols-3 gap-2">
                  {CAMERA_ANGLES.map(angle => (
                    <button
                      key={angle.id}
                      onClick={() => setCameraAngle(angle)}
                      className={`py-2 px-1 rounded-lg border flex flex-col items-center gap-1 transition-all ${cameraAngle.id === angle.id ? 'bg-zinc-800 border-white text-white' : 'bg-black border-zinc-800 text-zinc-600'}`}
                    >
                       <span className="text-[9px] font-bold text-center">{angle.label}</span>
                    </button>
                  ))}
                </div>
             </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => handleGenerate(false)}
              disabled={isGenerating}
              className={`flex-1 py-6 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl ${isGenerating ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-[1.02] hover:shadow-purple-500/25'}`}
            >
              {isGenerating ? '渲染中...' : '生成新場景'}
            </button>
            
            {segments.length > 0 && (
              <button 
                onClick={() => handleGenerate(true)}
                disabled={isGenerating}
                className={`flex-1 py-6 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl border border-cyan-500/50 text-cyan-400 hover:bg-cyan-950`}
              >
                + 續寫 (5秒)
              </button>
            )}
          </div>

        </div>

        {/* Right Column: Preview & Timeline */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-[3rem] p-4 flex items-center justify-center relative overflow-hidden min-h-[600px]">
            {segments.length > 0 ? (
              <video 
                ref={videoRef}
                src={segments[currentPlayingIndex]?.url} 
                controls 
                autoPlay 
                onEnded={handleVideoEnded}
                className="h-full w-full object-contain rounded-[2rem] shadow-2xl" 
              />
            ) : (
              <div className="text-center space-y-4 opacity-30">
                <div className="text-6xl animate-pulse">🎬</div>
                <div className="text-sm font-black uppercase tracking-widest">預覽畫面</div>
              </div>
            )}
             
            {isGenerating && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-10 p-8">
                 <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <div className="font-mono text-[10px] text-purple-300 space-y-1 text-center">
                    {logs.slice(0, 5).map((l, i) => <div key={i}>{l}</div>)}
                 </div>
              </div>
            )}
            
            {/* Timeline Indicator */}
            {segments.length > 0 && (
              <div className="absolute bottom-6 left-6 right-6 bg-black/50 backdrop-blur-md rounded-xl p-2 flex gap-2 overflow-x-auto">
                 {segments.map((seg, idx) => (
                   <div 
                     key={seg.id}
                     onClick={() => setCurrentPlayingIndex(idx)}
                     className={`flex-shrink-0 w-16 h-12 rounded-lg border-2 cursor-pointer relative overflow-hidden group ${currentPlayingIndex === idx ? 'border-cyan-500' : 'border-zinc-700 opacity-50 hover:opacity-100'}`}
                   >
                     <video src={seg.url} className="w-full h-full object-cover pointer-events-none" />
                     <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white text-center font-bold">
                       {idx + 1}
                     </div>
                   </div>
                 ))}
                 <div className="text-[10px] text-zinc-400 flex items-center px-2 font-mono">
                    總長: ~{segments.length * 6}秒
                 </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
             <button 
               disabled={segments.length === 0 || isUploading || !selectedChannelId}
               onClick={handleUpload}
               className={`p-6 rounded-[2rem] border transition-all flex flex-col items-center justify-center gap-2 ${segments.length > 0 ? 'bg-white text-black border-white hover:bg-zinc-200' : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'}`}
             >
               <div className="text-xl">☁️</div>
               <div className="text-[10px] font-black uppercase tracking-widest">
                  {isUploading ? '上傳中...' : segments.length > 1 ? '自動拼接並上傳' : '上傳最後片段'}
               </div>
             </button>

             {/* Download All Button for stitching */}
             {segments.length > 0 && (
               <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-[2rem] flex flex-col items-center justify-center gap-2 text-center">
                 <div className="text-[10px] text-zinc-400 mb-2 font-bold uppercase">需手動拼接</div>
                 <div className="flex gap-2 w-full overflow-x-auto">
                    {segments.map((s, i) => (
                      <a 
                        key={s.id}
                        href={s.url} 
                        download={`segment_${i+1}.mp4`}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] text-white font-mono border border-zinc-700"
                      >
                        ⬇ 片段 {i+1}
                      </a>
                    ))}
                 </div>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
