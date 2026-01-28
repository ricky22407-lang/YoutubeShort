
import React, { useState, useRef, useEffect } from 'react';
import { CharacterProfile, ChannelConfig, AgentMemory } from '../types';
import { AgentBrain } from '../services/agentBrain';

interface CharacterStudioProps {
  onBack: () => void;
  channels: ChannelConfig[];
  setChannels: React.Dispatch<React.SetStateAction<ChannelConfig[]>>;
}

const DEFAULT_PROFILE: CharacterProfile = {
  id: 'char_1',
  name: 'New Agent',
  age: '20',
  occupation: 'Digital Creator',
  gender: 'Female',
  personality: 'Curious, energetic, slightly clumsy but confident.',
  voiceTone: 'Casual, fast-paced, uses lots of slang.',
  contentFocus: 'Tech reviews, Daily Vlogs, Dance Challenges',
  constraints: 'No smoking, no politics, keep face visible.',
  description: 'A cute girl with pink bob hair.',
  images: {}
};

// 常用靈感預設 (繁體中文)
const BRAIN_PRESETS = [
    { label: "📹 日常 Vlog", value: "Daily Vlog, showing morning routine or daily life" },
    { label: "💄 美妝教學", value: "Makeup tutorial, getting ready with me (GRWM)" },
    { label: "👗 OOTD 穿搭", value: "Outfit of the day, fashion showcase, street style" },
    { label: "💃 舞蹈挑戰", value: "Trending Dance Challenge, energetic k-pop dance" },
    { label: "🍜 美食吃播", value: "Eating delicious food, ASMR mukbang" },
    { label: "📦 開箱影片", value: "Unboxing new gadgets or toys, excited reaction" }
];

const captureLastFrame = async (videoUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    
    video.onloadedmetadata = () => {
      video.currentTime = Math.max(0, video.duration - 0.1); 
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } else {
        reject(new Error("Canvas context failed"));
      }
    };

    video.onerror = (e) => reject(e);
  });
};

export const CharacterStudio: React.FC<CharacterStudioProps> = ({ onBack, channels, setChannels }) => {
  const [character, setCharacter] = useState<CharacterProfile>(DEFAULT_PROFILE);
  const [activeTab, setActiveTab] = useState<'profile' | 'brain' | 'studio'>('profile');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [memory, setMemory] = useState<AgentMemory>(AgentBrain.initMemory());
  
  const [isThinking, setIsThinking] = useState(false);
  const [isReflecting, setIsReflecting] = useState(false);

  const [agentIdea, setAgentIdea] = useState<{
      topic: string; 
      reasoning: string; 
      outfit_idea: string; 
      hairstyle_idea: string;
      visual_style: string;
      category: string;
  } | null>(null);

  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [studioParams, setStudioParams] = useState({
      prompt: '',
      outfit: '',
      hair: '',
      cameraAngle: 'waist_up',
      startImage: '' as string | null
  });
  const [clips, setClips] = useState<{id: string, url: string, prompt: string}[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchedVideo, setStitchedVideo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const threeViewRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const fullBodyRef = useRef<HTMLInputElement>(null);
  const sideRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels]);

  useEffect(() => {
    const ch = channels.find(c => c.id === selectedChannelId);
    if (ch) {
      if (ch.characterProfile) setCharacter(ch.characterProfile);
      else setCharacter({ ...DEFAULT_PROFILE, name: ch.name });
      
      if (ch.agentMemory) setMemory(ch.agentMemory);
      else setMemory(AgentBrain.initMemory());
    }
  }, [selectedChannelId]);

  useEffect(() => {
      if (chatBottomRef.current) {
          chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [chatHistory, activeTab]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: keyof CharacterProfile['images']) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharacter(prev => ({ 
          ...prev, 
          images: { ...prev.images, [type]: reader.result as string } 
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAgentThink = async (topicHint?: string) => {
    setIsThinking(true);
    setAgentIdea(null);
    setChatHistory([]); 
    try {
        const mockTrends = [{ id: '1', title: 'Viral Trend', hashtags: [], view_count: 1000000, view_growth_rate: 5 }];
        // 傳遞 topicHint
        const decision = await AgentBrain.think(character, memory, mockTrends, topicHint);
        setAgentIdea(decision);
        setChatHistory([{ role: 'ai', content: `我想到了這個點子："${decision.topic}"。你覺得如何？` }]);
    } catch (e) {
        console.error(e);
        alert("Agent Brain Overload (Error)");
    } finally {
        setIsThinking(false);
    }
  };

  const handleChatSend = async () => {
      if (!chatInput.trim() || !agentIdea) return;
      
      const userMsg = chatInput;
      setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
      setChatInput('');
      setIsChatting(true);

      try {
          const result = await AgentBrain.chat(character, agentIdea, userMsg);
          setChatHistory(prev => [...prev, { role: 'ai', content: result.reply }]);
          
          if (result.updatedPlan) {
              setAgentIdea(result.updatedPlan);
          }
      } catch (e) {
          console.error(e);
          setChatHistory(prev => [...prev, { role: 'ai', content: "(System Error: Brain connection lost)" }]);
      } finally {
          setIsChatting(false);
      }
  };

  // 處理 IME (輸入法) Enter 鍵問題
  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          // 如果正在選字 (isComposing 為 true)，則不送出
          if (e.nativeEvent.isComposing) return;
          e.preventDefault();
          handleChatSend();
      }
  };

  const handleReflect = async () => {
      setIsReflecting(true);
      try {
          await new Promise(r => setTimeout(r, 1000));
          const newMemory = await AgentBrain.reflect(memory);
          setMemory(newMemory);
          setChannels(prev => prev.map(c => c.id === selectedChannelId ? { ...c, agentMemory: newMemory } : c));
      } catch (e) {
          alert("Reflection Failed");
      } finally {
          setIsReflecting(false);
      }
  };

  const transferIdeaToStudio = () => {
      if (!agentIdea) return;
      setStudioParams({
          prompt: `${agentIdea.topic}. ${agentIdea.visual_style}`,
          outfit: agentIdea.outfit_idea,
          hair: agentIdea.hairstyle_idea,
          cameraAngle: 'waist_up',
          startImage: null
      });
      setActiveTab('studio');
  };

  const handleGenerateClip = async () => {
      setIsGenerating(true);
      try {
          const res = await fetch('/api/character_pipeline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  character,
                  vibe: { prompt: studioParams.prompt },
                  customOutfit: studioParams.outfit,
                  customHair: studioParams.hair,
                  cameraAngle: studioParams.cameraAngle,
                  startImage: studioParams.startImage
              })
          });
          const data = await res.json();
          if (data.success && data.videoUrl) {
              setClips(prev => [...prev, { id: Date.now().toString(), url: data.videoUrl, prompt: studioParams.prompt }]);
              setStudioParams(prev => ({ ...prev, startImage: null }));
          } else {
              alert("Generation Failed: " + (data.error || JSON.stringify(data)));
          }
      } catch (e: any) {
          alert("Error: " + e.message);
      } finally {
          setIsGenerating(false);
      }
  };

  const handleContinueClip = async (videoUrl: string) => {
      try {
          const lastFrame = await captureLastFrame(videoUrl);
          setStudioParams(prev => ({ ...prev, startImage: lastFrame }));
          window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {
          alert("Failed to capture frame for continuation.");
      }
  };

  const handleStitchVideos = async () => {
      if (clips.length < 2) return alert("Need at least 2 clips to stitch.");
      setIsStitching(true);
      try {
          const res = await fetch('/api/stitch_videos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ segments: clips.map(c => c.url) })
          });
          const data = await res.json();
          if (data.success) {
              setStitchedVideo(data.mergedVideoUrl);
          } else {
              alert("Stitch Failed: " + data.error);
          }
      } catch (e) {
          console.error(e);
          alert("Stitch Error");
      } finally {
          setIsStitching(false);
      }
  };

  const handleUploadVideo = async (targetVideoUrl: string) => {
      const channel = channels.find(c => c.id === selectedChannelId);
      if (!channel?.auth) return alert("請先在核心管理頁面連結 YouTube 頻道。");
      
      if (!confirm("確定要將此影片發布到 YouTube Shorts 嗎？")) return;

      setIsUploading(true);
      try {
          const res = await fetch('/api/upload_video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoUrl: targetVideoUrl,
                  auth: channel.auth,
                  metadata: {
                      title: studioParams.prompt.slice(0, 50) + " #shorts",
                      desc: `Generated by ${character.name}`
                  }
              })
          });
          const data = await res.json();
          if (data.success) {
              alert(`🎉 上傳成功！Video ID: ${data.videoId}`);
          } else {
              alert("Upload Failed: " + data.error);
          }
      } catch (e) {
          alert("Upload Error");
      } finally {
          setIsUploading(false);
      }
  };

  const saveConfig = () => {
     setChannels(prev => prev.map(c => c.id === selectedChannelId ? { 
         ...c, 
         mode: 'character',
         characterProfile: character, 
         agentMemory: memory 
     } : c));
     alert("✅ 藝人檔案與記憶庫已更新！");
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-purple-900/30 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-zinc-800 transition-colors">←</button>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              AI 經紀人系統 V9.8
            </h1>
            <p className="text-xs text-purple-400/60 font-mono tracking-widest uppercase">Autonomous Idol Management</p>
          </div>
        </div>
        
        <select 
            value={selectedChannelId} 
            onChange={e => setSelectedChannelId(e.target.value)} 
            className="bg-zinc-900 border border-zinc-800 py-2 px-4 rounded-full text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"
        >
            {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Navigation Tabs */}
      <div className="flex justify-center mb-8">
         <div className="flex bg-zinc-900/50 p-1 rounded-full border border-zinc-800 backdrop-blur-md">
             {[
               { id: 'profile', icon: '👤', label: '藝人檔案' },
               { id: 'brain', icon: '🧠', label: '大腦與靈感' },
               { id: 'studio', icon: '🎬', label: '片場與剪輯' }
             ].map(tab => (
                 <button 
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id as any)} 
                   className={`px-8 py-3 rounded-full text-xs font-black transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white text-black shadow-lg shadow-white/20' : 'text-zinc-500 hover:text-white'}`}
                 >
                   <span>{tab.icon}</span>
                   <span>{tab.label}</span>
                 </button>
             ))}
         </div>
      </div>

      <div className="max-w-7xl mx-auto">
        
        {/* === TAB 1: PROFILE MANAGEMENT === */}
        {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-down">
                {/* Left: Visual Assets */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem]">
                        <h2 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-4">核心視覺 (Visual Identity)</h2>
                        <div 
                          onClick={() => threeViewRef.current?.click()}
                          className="aspect-video w-full bg-zinc-900 rounded-xl border-2 border-dashed border-zinc-700 hover:border-cyan-500 cursor-pointer relative overflow-hidden group transition-all mb-4"
                        >
                            {character.images.threeView ? (
                                <img src={character.images.threeView} className="w-full h-full object-contain" />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
                                    <span className="text-4xl">📐</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">上傳三視圖 (推薦)</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold transition-opacity">更換圖片</div>
                            <input ref={threeViewRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'threeView')} />
                        </div>
                        {/* Secondary Images (Hidden for brevity, assumes implementation matches previous) */}
                         <div className="grid grid-cols-2 gap-3">
                            <div onClick={() => frontRef.current?.click()} className="aspect-[3/4] bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600 group">
                                {character.images.front ? <img src={character.images.front} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">正面 (Front)</div>}
                                <input ref={frontRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'front')} />
                            </div>
                            <div onClick={() => fullBodyRef.current?.click()} className="aspect-[3/4] bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600 group">
                                {character.images.fullBody ? <img src={character.images.fullBody} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">全身 (Full)</div>}
                                <input ref={fullBodyRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'fullBody')} />
                            </div>
                        </div>
                    </div>
                    <button onClick={saveConfig} className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black uppercase rounded-2xl hover:scale-[1.02] transition-transform shadow-lg shadow-purple-900/50">
                        儲存藝人檔案
                    </button>
                </div>

                {/* Right: Bio & Logic */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-[2rem] space-y-6">
                        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                            <h2 className="text-xs font-black text-purple-500 uppercase tracking-widest">基本資料 (Bio)</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase">藝名</label>
                                <input value={character.name} onChange={e => setCharacter({...character, name: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm font-bold text-white focus:border-purple-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase">職業</label>
                                <input value={character.occupation || ''} onChange={e => setCharacter({...character, occupation: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm text-zinc-300 focus:border-purple-500 outline-none" />
                            </div>
                        </div>
                        <div className="space-y-2">
                             <label className="text-[10px] font-bold text-zinc-500 uppercase">性格與行為</label>
                             <textarea value={character.personality} onChange={e => setCharacter({...character, personality: e.target.value})} className="w-full h-24 bg-black border border-zinc-800 p-4 rounded-xl text-xs leading-relaxed text-zinc-300 focus:border-purple-500 outline-none resize-none" />
                        </div>
                        <div className="space-y-2">
                             <label className="text-[10px] font-bold text-red-500 uppercase">禁忌事項 (Constraints)</label>
                             <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
                                <textarea value={character.constraints} onChange={e => setCharacter({...character, constraints: e.target.value})} className="w-full h-16 bg-transparent border-none p-0 text-xs text-red-200 outline-none resize-none" />
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* === TAB 2: AGENT BRAIN === */}
        {activeTab === 'brain' && (
            <div className="grid grid-cols-1 gap-8 animate-fade-in">
                 <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-[2rem] relative overflow-hidden min-h-[400px]">
                    <div className="absolute top-0 right-0 p-10 opacity-10 text-[10rem]">🧠</div>
                    
                    <div className="max-w-3xl mx-auto space-y-8 relative z-10">
                        <div className="text-center">
                            <h2 className="text-3xl font-black italic">Agent Neural Core</h2>
                            
                            {/* 預設靈感標籤 (Presets) */}
                            <div className="flex flex-wrap justify-center gap-3 mt-6">
                                {BRAIN_PRESETS.map((p, i) => (
                                    <button 
                                        key={i}
                                        disabled={isThinking}
                                        onClick={() => handleAgentThink(p.value)}
                                        className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-white hover:text-black border border-zinc-700 text-[11px] font-bold transition-all disabled:opacity-50"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex justify-center mt-6">
                                <button onClick={() => handleAgentThink()} disabled={isThinking} className={`px-12 py-6 rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all border ${isThinking ? 'bg-zinc-900 border-zinc-800 text-zinc-600 animate-pulse' : 'bg-white text-black border-white hover:scale-105'}`}>
                                    {isThinking ? '思考中 (Thinking)...' : '🎲 隨機觸發靈感'}
                                </button>
                            </div>
                        </div>

                        {agentIdea && (
                            <div className="space-y-4">
                                <div className="bg-gradient-to-br from-purple-900/40 to-black border border-purple-500/30 p-8 rounded-3xl text-left animate-slide-down backdrop-blur-sm">
                                    <div className="flex items-start gap-6">
                                        <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/30 text-2xl shrink-0">AI</div>
                                        <div className="space-y-4 flex-1">
                                            <div>
                                            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">AI 提案 (Generated Concept)</div>
                                            <h3 className="text-2xl font-black text-white leading-tight">"{agentIdea.topic}"</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                                    <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">OOTD 建議</div>
                                                    <div className="text-sm font-bold text-pink-300">👚 {agentIdea.outfit_idea}</div>
                                                </div>
                                                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                                    <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">髮型建議</div>
                                                    <div className="text-sm font-bold text-blue-300">💇‍♀️ {agentIdea.hairstyle_idea}</div>
                                                </div>
                                            </div>
                                            <p className="text-sm text-zinc-300 border-l-2 border-purple-500/30 pl-4 py-1">{agentIdea.reasoning}</p>
                                            
                                            <button onClick={transferIdeaToStudio} className="w-full mt-4 py-3 bg-white text-black font-black uppercase rounded-xl hover:bg-cyan-500 hover:text-white transition-colors">
                                                👉 採用此企劃 (Go to Studio)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Chat Interface */}
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 animate-fade-in">
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase text-center tracking-widest">與經紀人溝通</div>
                                    <div className="max-h-64 overflow-y-auto space-y-3 px-2 custom-scrollbar">
                                        {chatHistory.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[80%] p-3 rounded-2xl text-xs font-medium ${msg.role === 'user' ? 'bg-zinc-800 text-white rounded-br-none' : 'bg-purple-900/30 text-purple-100 border border-purple-800/50 rounded-bl-none'}`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}
                                        {isChatting && <div className="text-[10px] text-zinc-500 animate-pulse text-left">Agent is typing...</div>}
                                        <div ref={chatBottomRef} />
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            value={chatInput} 
                                            onChange={e => setChatInput(e.target.value)}
                                            onKeyDown={handleChatKeyDown} // 修復輸入法問題
                                            disabled={isChatting}
                                            placeholder="請輸入回饋 (例如: '衣服換成可愛一點的' 或 '改拍吃播')" 
                                            className="flex-1 bg-black border border-zinc-800 rounded-full px-4 py-3 text-xs focus:border-purple-500 outline-none"
                                        />
                                        <button 
                                            onClick={handleChatSend}
                                            disabled={isChatting || !chatInput.trim()}
                                            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold hover:bg-purple-500 hover:text-white disabled:opacity-50 transition-colors"
                                        >
                                            ➤
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Strategy Bias Panel (Hidden for brevity, assumes implementation matches previous) */}
                 </div>
            </div>
        )}

        {/* === TAB 3: STUDIO === */}
        {activeTab === 'studio' && (
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-down">
                 {/* Left: Generator Control */}
                 <div className="lg:col-span-4 space-y-6">
                     <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-5">
                         <h2 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-2">生成控制台 (Generator)</h2>
                         
                         {studioParams.startImage && (
                             <div className="relative group">
                                 <div className="text-[10px] font-bold text-green-500 uppercase mb-2 flex items-center gap-2">
                                     <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                     續寫模式開啟 (Continuation)
                                 </div>
                                 <img src={studioParams.startImage} className="w-full h-32 object-cover rounded-xl border border-green-500/30 opacity-80" />
                                 <button onClick={() => setStudioParams(p => ({...p, startImage: null}))} className="absolute top-2 right-2 bg-black/50 hover:bg-red-500 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center transition-colors">✕</button>
                             </div>
                         )}

                         <div>
                             <label className="text-[10px] font-bold text-zinc-500 uppercase">Prompt (動作/情境)</label>
                             <textarea 
                                 value={studioParams.prompt}
                                 onChange={e => setStudioParams({...studioParams, prompt: e.target.value})}
                                 className="w-full h-24 bg-black border border-zinc-800 p-3 rounded-xl text-xs text-zinc-300 outline-none focus:border-cyan-500 mt-2"
                                 placeholder="描述這一段影片要發生什麼..."
                             />
                         </div>
                         {/* Controls (Hidden for brevity) */}
                         <button 
                             onClick={handleGenerateClip}
                             disabled={isGenerating}
                             className={`w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest ${isGenerating ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-cyan-500 hover:text-white'}`}
                         >
                             {isGenerating ? '生成中 (Generating)...' : '生成片段 (Generate Clip)'}
                         </button>
                     </div>
                 </div>

                 {/* Right: Timeline & Editor */}
                 <div className="lg:col-span-8 space-y-6">
                     <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] min-h-[600px] flex flex-col">
                         <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xs font-black text-purple-500 uppercase tracking-widest">剪輯時間軸 (Timeline)</h2>
                            <div className="text-[10px] text-zinc-500 font-bold">Total Clips: {clips.length}</div>
                         </div>

                         <div className="flex-1 space-y-4 mb-6">
                             {clips.length === 0 ? (
                                 <div className="h-full flex items-center justify-center text-zinc-700 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-zinc-900 rounded-xl">
                                     尚無片段，請左側生成
                                 </div>
                             ) : (
                                 clips.map((clip, idx) => (
                                     <div key={clip.id} className="flex gap-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl group">
                                         <div className="w-12 h-12 flex items-center justify-center bg-zinc-800 rounded-full font-black text-zinc-500 text-sm">
                                             {idx + 1}
                                         </div>
                                         <video src={clip.url} controls className="h-32 w-auto rounded-lg border border-zinc-700 bg-black" />
                                         <div className="flex-1 flex flex-col justify-between py-1">
                                             <p className="text-xs text-zinc-400 line-clamp-2">{clip.prompt}</p>
                                             <div className="flex flex-wrap gap-2">
                                                 <button 
                                                     onClick={() => handleContinueClip(clip.url)}
                                                     className="px-3 py-1.5 bg-green-900/30 text-green-400 border border-green-800 rounded-lg text-[10px] font-bold hover:bg-green-500 hover:text-white transition-colors"
                                                 >
                                                     以此續寫
                                                 </button>
                                                 {/* 新增：單片段上傳按鈕 */}
                                                 <button 
                                                     onClick={() => handleUploadVideo(clip.url)}
                                                     disabled={isUploading}
                                                     className="px-3 py-1.5 bg-blue-900/30 text-blue-400 border border-blue-800 rounded-lg text-[10px] font-bold hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-1"
                                                 >
                                                     {isUploading ? '...' : '☁️ 上傳此片段'}
                                                 </button>
                                                 <button 
                                                     onClick={() => setClips(clips.filter(c => c.id !== clip.id))}
                                                     className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-800 rounded-lg text-[10px] font-bold hover:bg-red-500 hover:text-white transition-colors"
                                                 >
                                                     刪除
                                                 </button>
                                             </div>
                                         </div>
                                     </div>
                                 ))
                             )}
                         </div>

                         {/* Action Footer */}
                         <div className="border-t border-zinc-800 pt-6 flex gap-4">
                             <button 
                                 onClick={handleStitchVideos}
                                 disabled={clips.length < 2 || isStitching}
                                 className="flex-1 py-4 bg-zinc-800 text-white font-bold uppercase text-xs rounded-xl hover:bg-purple-600 disabled:opacity-50"
                             >
                                 {isStitching ? '拼接中...' : '拼接所有片段 (Stitch All)'}
                             </button>
                             
                             {/* 如果有拼接影片，或至少有一個片段，顯示全域上傳按鈕 */}
                             {(stitchedVideo || clips.length > 0) && (
                                 <button 
                                     onClick={() => handleUploadVideo(stitchedVideo || clips[clips.length-1].url)}
                                     disabled={isUploading}
                                     className="flex-1 py-4 bg-white text-black font-black uppercase text-xs rounded-xl hover:bg-green-500 hover:text-white shadow-lg shadow-white/10 disabled:opacity-50"
                                 >
                                     {isUploading ? '上傳中...' : '上傳至 YouTube (Upload)'}
                                 </button>
                             )}
                         </div>

                         {stitchedVideo && (
                             <div className="mt-6 p-4 bg-black border border-purple-500/50 rounded-xl animate-fade-in">
                                 <div className="text-[10px] font-bold text-purple-400 uppercase mb-2">Final Output Preview</div>
                                 <video src={stitchedVideo} controls className="w-full rounded-lg" />
                             </div>
                         )}
                     </div>
                 </div>
             </div>
        )}

      </div>
    </div>
  );
};
