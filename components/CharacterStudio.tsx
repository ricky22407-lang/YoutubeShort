
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

// 輔助：從影片 Blob/DataURL 中擷取最後一幀圖片作為續寫參考
const captureLastFrame = async (videoUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    
    video.onloadedmetadata = () => {
      video.currentTime = Math.max(0, video.duration - 0.1); // Seek to end
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
  
  // Agent Thinking State
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

  // Chat State
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Studio / Editor State
  const [studioParams, setStudioParams] = useState({
      prompt: '',
      outfit: '',
      hair: '',
      cameraAngle: 'waist_up',
      startImage: '' as string | null // For continuation
  });
  const [clips, setClips] = useState<{id: string, url: string, prompt: string}[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchedVideo, setStitchedVideo] = useState<string | null>(null);

  // Refs for uploads
  const threeViewRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const fullBodyRef = useRef<HTMLInputElement>(null);
  const sideRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  // Load Channel Data
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

  // Scroll to bottom of chat
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

  const handleAgentThink = async () => {
    setIsThinking(true);
    setAgentIdea(null);
    setChatHistory([]); // Reset chat on new idea
    try {
        const mockTrends = [{ id: '1', title: 'Viral Dance Challenge', hashtags: [], view_count: 1000000, view_growth_rate: 5 }];
        // @ts-ignore
        const decision = await AgentBrain.think(character, memory, mockTrends);
        setAgentIdea(decision);
        setChatHistory([{ role: 'ai', content: `I've got a new idea: "${decision.topic}". What do you think, boss?` }]);
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

  const handleUploadFinal = async () => {
      if (!stitchedVideo && clips.length === 0) return;
      const targetVideo = stitchedVideo || clips[0].url;
      const channel = channels.find(c => c.id === selectedChannelId);
      if (!channel?.auth) return alert("Please connect YouTube channel first.");

      try {
          const res = await fetch('/api/upload_video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoUrl: targetVideo,
                  auth: channel.auth,
                  metadata: {
                      title: studioParams.prompt.slice(0, 50) + " #shorts",
                      desc: `Generated by ${character.name}`
                  }
              })
          });
          const data = await res.json();
          if (data.success) {
              alert(`Uploaded! Video ID: ${data.videoId}`);
          } else {
              alert("Upload Failed: " + data.error);
          }
      } catch (e) {
          alert("Upload Error");
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
              AI 經紀人系統 V9.7
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
                        
                        {/* 3-View Chart Upload (Hero) */}
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

                        {/* Secondary Images Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div 
                                onClick={() => frontRef.current?.click()}
                                className="aspect-[3/4] bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600 group"
                            >
                                {character.images.front ? <img src={character.images.front} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">正面 (Front)</div>}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold transition-opacity">更換</div>
                                <input ref={frontRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'front')} />
                            </div>

                            <div 
                                onClick={() => fullBodyRef.current?.click()}
                                className="aspect-[3/4] bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600 group"
                            >
                                {character.images.fullBody ? <img src={character.images.fullBody} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">全身 (Full)</div>}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold transition-opacity">更換</div>
                                <input ref={fullBodyRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'fullBody')} />
                            </div>

                            <div 
                                onClick={() => sideRef.current?.click()}
                                className="aspect-[3/4] bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600 group"
                            >
                                {character.images.side ? <img src={character.images.side} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">側面 (Side)</div>}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold transition-opacity">更換</div>
                                <input ref={sideRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'side')} />
                            </div>

                            <div 
                                onClick={() => backRef.current?.click()}
                                className="aspect-[3/4] bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600 group"
                            >
                                {character.images.back ? <img src={character.images.back} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">背面 (Back)</div>}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold transition-opacity">更換</div>
                                <input ref={backRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'back')} />
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
                            <div className="flex justify-center mt-4">
                                <button onClick={handleAgentThink} disabled={isThinking} className={`px-12 py-6 rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all border ${isThinking ? 'bg-zinc-900 border-zinc-800 text-zinc-600 animate-pulse' : 'bg-white text-black border-white hover:scale-105'}`}>
                                    {isThinking ? 'Thinking...' : '觸發靈感 (Trigger Ideation)'}
                                </button>
                            </div>
                        </div>

                        {agentIdea && (
                            <div className="space-y-4">
                                {/* Idea Card */}
                                <div className="bg-gradient-to-br from-purple-900/40 to-black border border-purple-500/30 p-8 rounded-3xl text-left animate-slide-down backdrop-blur-sm">
                                    <div className="flex items-start gap-6">
                                        <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/30 text-2xl shrink-0">AI</div>
                                        <div className="space-y-4 flex-1">
                                            <div>
                                            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Generated Concept</div>
                                            <h3 className="text-2xl font-black text-white leading-tight">"{agentIdea.topic}"</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                                    <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">OOTD</div>
                                                    <div className="text-sm font-bold text-pink-300">👚 {agentIdea.outfit_idea}</div>
                                                </div>
                                                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                                    <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Hair</div>
                                                    <div className="text-sm font-bold text-blue-300">💇‍♀️ {agentIdea.hairstyle_idea}</div>
                                                </div>
                                            </div>
                                            <p className="text-sm text-zinc-300 border-l-2 border-purple-500/30 pl-4 py-1">{agentIdea.reasoning}</p>
                                            
                                            <button onClick={transferIdeaToStudio} className="w-full mt-4 py-3 bg-white text-black font-black uppercase rounded-xl hover:bg-cyan-500 hover:text-white transition-colors">
                                                👉 前往片場製作 (Produce This)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Chat Interface */}
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 animate-fade-in">
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase text-center tracking-widest">Discussion Log</div>
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
                                            onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                                            disabled={isChatting}
                                            placeholder="Give feedback (e.g., 'Make it more punk' or 'Change outfit')" 
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

                 {/* 策略權重與歷史復盤 */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Strategy Bias Panel */}
                    <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem]">
                        <div className="flex justify-between items-center mb-4">
                             <h3 className="text-xs font-black text-zinc-500 uppercase">策略權重 (Strategy Bias)</h3>
                             <button 
                                onClick={handleReflect}
                                disabled={isReflecting}
                                className="px-3 py-1 bg-zinc-800 text-cyan-400 text-[10px] font-bold rounded-full hover:bg-zinc-700 transition-colors flex items-center gap-2"
                             >
                                 {isReflecting ? <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div> : "📊 進行成效復盤 (Reflect)"}
                             </button>
                        </div>
                        
                        <div className="space-y-4">
                             {Object.entries(memory.strategy_bias).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-4 group">
                                   <span className="text-[10px] uppercase w-20 text-zinc-400 font-bold group-hover:text-white transition-colors">{k}</span>
                                   <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000 ease-out" 
                                        style={{ width: `${(v as number) * 100}%` }}
                                      ></div>
                                   </div>
                                   <span className="text-[10px] font-mono text-white w-8 text-right">{((v as number) * 100).toFixed(0)}%</span>
                                </div>
                             ))}
                        </div>
                        <p className="text-[9px] text-zinc-600 mt-4 italic">
                            * 點擊「復盤」按鈕，AI 會根據歷史影片觀看數自動調整這些權重。
                        </p>
                    </div>
                    
                    {/* History Panel */}
                    <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem]">
                        <h3 className="text-xs font-black text-zinc-500 uppercase mb-4">影片表現 (Performance History)</h3>
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {memory.history.map((h, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`w-2 h-2 rounded-full ${h.category === 'dance' ? 'bg-pink-500' : h.category === 'vlog' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                                        <div className="truncate text-xs text-zinc-300 font-bold">{h.topic}</div>
                                    </div>
                                    <div className="text-[10px] font-mono text-zinc-500 flex flex-col items-end">
                                        <span className={h.stats && h.stats.views > 10000 ? "text-green-400 font-bold" : ""}>
                                            {h.stats?.views.toLocaleString()} views
                                        </span>
                                        <span className="text-zinc-700">{h.category}</span>
                                    </div>
                                </div>
                            ))}
                            {memory.history.length === 0 && <div className="text-xs text-zinc-600 italic">尚無記憶數據</div>}
                        </div>
                    </div>
                 </div>
            </div>
        )}

        {/* ... (Tab 3 remains unchanged) ... */}
        {activeTab === 'studio' && (
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-down">
                 {/* Left: Generator Control */}
                 <div className="lg:col-span-4 space-y-6">
                     <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-5">
                         <h2 className="text-xs font-black text-cyan-500 uppercase tracking-widest mb-2">生成控制台 (Generator)</h2>
                         
                         {/* Continuation Preview */}
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

                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="text-[10px] font-bold text-zinc-500 uppercase">服裝 (Outfit)</label>
                                 <input 
                                     value={studioParams.outfit}
                                     onChange={e => setStudioParams({...studioParams, outfit: e.target.value})}
                                     className="w-full bg-black border border-zinc-800 p-2 rounded-xl text-xs text-white mt-1"
                                 />
                             </div>
                             <div>
                                 <label className="text-[10px] font-bold text-zinc-500 uppercase">鏡位 (Angle)</label>
                                 <select 
                                     value={studioParams.cameraAngle}
                                     onChange={e => setStudioParams({...studioParams, cameraAngle: e.target.value})}
                                     className="w-full bg-black border border-zinc-800 p-2 rounded-xl text-xs text-white mt-1"
                                 >
                                     <option value="close_up">特寫 (Close Up)</option>
                                     <option value="waist_up">半身 (Waist Up)</option>
                                     <option value="full_body">全身 (Full Body)</option>
                                 </select>
                             </div>
                         </div>

                         <button 
                             onClick={handleGenerateClip}
                             disabled={isGenerating}
                             className={`w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest ${isGenerating ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-cyan-500 hover:text-white'}`}
                         >
                             {isGenerating ? 'Generating...' : '生成片段 (Generate Clip)'}
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

                         {/* Clips Grid */}
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
                                             <div className="flex gap-2">
                                                 <button 
                                                     onClick={() => handleContinueClip(clip.url)}
                                                     className="px-3 py-1.5 bg-green-900/30 text-green-400 border border-green-800 rounded-lg text-[10px] font-bold hover:bg-green-500 hover:text-white transition-colors"
                                                 >
                                                     以此續寫 (Extend)
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
                                 {isStitching ? 'Stitching...' : '拼接所有片段 (Stitch All)'}
                             </button>
                             
                             {stitchedVideo && (
                                 <button 
                                     onClick={handleUploadFinal}
                                     className="flex-1 py-4 bg-white text-black font-black uppercase text-xs rounded-xl hover:bg-green-500 hover:text-white shadow-lg shadow-white/10"
                                 >
                                     上傳至 YouTube (Upload)
                                 </button>
                             )}
                         </div>

                         {/* Stitched Preview */}
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
