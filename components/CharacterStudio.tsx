
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

export const CharacterStudio: React.FC<CharacterStudioProps> = ({ onBack, channels, setChannels }) => {
  const [character, setCharacter] = useState<CharacterProfile>(DEFAULT_PROFILE);
  const [activeTab, setActiveTab] = useState<'profile' | 'brain' | 'studio'>('profile');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [memory, setMemory] = useState<AgentMemory>(AgentBrain.initMemory());
  
  // Agent Thinking State
  const [isThinking, setIsThinking] = useState(false);
  // 更新 State 結構以包含服裝資訊
  const [agentIdea, setAgentIdea] = useState<{
      topic: string; 
      reasoning: string; 
      outfit_idea: string; 
      hairstyle_idea: string;
  } | null>(null);

  // Refs for uploads
  const threeViewRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);

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
      else setCharacter({ ...DEFAULT_PROFILE, name: ch.name }); // Default fallback
      
      if (ch.agentMemory) setMemory(ch.agentMemory);
      else setMemory(AgentBrain.initMemory());
    }
  }, [selectedChannelId]);

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
    try {
        const mockTrends = [{ id: '1', title: 'Viral Dance Challenge', hashtags: [], view_count: 1000000, view_growth_rate: 5 }];
        // @ts-ignore - Ignore transient type mismatch during dev
        const decision = await AgentBrain.think(character, memory, mockTrends);
        setAgentIdea(decision);
    } catch (e) {
        console.error(e);
        alert("Agent Brain Overload (Error)");
    } finally {
        setIsThinking(false);
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
              AI 經紀人系統 V9.0
            </h1>
            <p className="text-xs text-purple-400/60 font-mono tracking-widest uppercase">Autonomous Idol Management</p>
          </div>
        </div>
        
        {/* Channel Selector in Header */}
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
               { id: 'profile', icon: '👤', label: '藝人檔案 (Profile)' },
               { id: 'brain', icon: '🧠', label: '大腦與決策 (Brain)' },
               { id: 'studio', icon: '🎬', label: '手動片場 (Studio)' }
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

      <div className="max-w-6xl mx-auto">
        
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
                                    <span className="text-[9px] text-zinc-700">Front / Side / Back Reference</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold transition-opacity">更換圖片</div>
                            <input ref={threeViewRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'threeView')} />
                        </div>

                        {/* Secondary Images */}
                        <div className="grid grid-cols-2 gap-3">
                            <div 
                                onClick={() => frontRef.current?.click()}
                                className="aspect-square bg-zinc-900 rounded-xl border border-zinc-800 relative overflow-hidden cursor-pointer hover:border-zinc-600"
                            >
                                {character.images.front ? <img src={character.images.front} className="w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-bold">正面特寫</div>}
                                <input ref={frontRef} type="file" className="hidden" onChange={e => handleImageUpload(e, 'front')} />
                            </div>
                            <div className="aspect-square bg-zinc-900/50 rounded-xl border border-zinc-800 flex items-center justify-center text-[9px] text-zinc-700 p-2 text-center">
                                更多角度可增加準確度
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
                            <div className="flex gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase">藝名 (Name)</label>
                                <input value={character.name} onChange={e => setCharacter({...character, name: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm font-bold text-white focus:border-purple-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase">職業 (Occupation)</label>
                                <input value={character.occupation || ''} onChange={e => setCharacter({...character, occupation: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm text-zinc-300 focus:border-purple-500 outline-none" placeholder="e.g. VTuber" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase">年齡 (Age)</label>
                                <input value={character.age || ''} onChange={e => setCharacter({...character, age: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm text-zinc-300 focus:border-purple-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase">性別 (Gender)</label>
                                <input value={character.gender || ''} onChange={e => setCharacter({...character, gender: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm text-zinc-300 focus:border-purple-500 outline-none" />
                            </div>
                        </div>

                        <div className="space-y-2">
                             <label className="text-[10px] font-bold text-zinc-500 uppercase">性格與行為 (Personality & Behavior)</label>
                             <textarea 
                                value={character.personality} 
                                onChange={e => setCharacter({...character, personality: e.target.value})}
                                className="w-full h-24 bg-black border border-zinc-800 p-4 rounded-xl text-xs leading-relaxed text-zinc-300 focus:border-purple-500 outline-none resize-none"
                                placeholder="描述角色的個性，例如：活潑好動、容易害羞、喜歡吐槽..."
                             />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                             <div className="space-y-2">
                                 <label className="text-[10px] font-bold text-zinc-500 uppercase">語氣/口頭禪 (Voice Tone)</label>
                                 <input value={character.voiceTone} onChange={e => setCharacter({...character, voiceTone: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs text-zinc-300 focus:border-purple-500 outline-none" placeholder="e.g. Sarcastic, Gen-Z slang" />
                             </div>
                             <div className="space-y-2">
                                 <label className="text-[10px] font-bold text-zinc-500 uppercase">內容領域 (Content Niche)</label>
                                 <input value={character.contentFocus} onChange={e => setCharacter({...character, contentFocus: e.target.value})} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-xs text-zinc-300 focus:border-purple-500 outline-none" placeholder="e.g. Tech, Lifestyle" />
                             </div>
                        </div>

                        <div className="space-y-2">
                             <label className="text-[10px] font-bold text-red-500 uppercase">禁忌事項 / 限制 (Constraints)</label>
                             <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
                                <textarea 
                                    value={character.constraints} 
                                    onChange={e => setCharacter({...character, constraints: e.target.value})}
                                    className="w-full h-16 bg-transparent border-none p-0 text-xs text-red-200 placeholder-red-900/50 outline-none resize-none"
                                    placeholder="AI 絕對不能做的事情，例如：不能吸菸、不能談論政治..."
                                />
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
                    
                    <div className="max-w-2xl mx-auto text-center space-y-8 relative z-10">
                        <h2 className="text-3xl font-black italic">Agent Neural Core</h2>
                        <p className="text-zinc-500 text-sm">AI 將根據剛剛設定的「藝人檔案」與「市場趨勢」進行思考。</p>
                        
                        <div className="flex justify-center">
                            <button 
                                onClick={handleAgentThink}
                                disabled={isThinking}
                                className={`px-12 py-6 rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all border ${isThinking ? 'bg-zinc-900 border-zinc-800 text-zinc-600 animate-pulse' : 'bg-white text-black border-white hover:scale-105 hover:shadow-cyan-500/50'}`}
                            >
                                {isThinking ? 'Thinking...' : '觸發靈感 (Trigger Ideation)'}
                            </button>
                        </div>

                        {agentIdea && (
                            <div className="mt-8 bg-gradient-to-br from-purple-900/40 to-black border border-purple-500/30 p-8 rounded-3xl text-left animate-slide-down backdrop-blur-sm">
                                <div className="flex items-start gap-6">
                                    <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/30 text-2xl shrink-0">AI</div>
                                    <div className="space-y-4 flex-1">
                                        <div>
                                           <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Concept</div>
                                           <h3 className="text-2xl font-black text-white leading-tight">"{agentIdea.topic}"</h3>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                                <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">OOTD (Outfit Idea)</div>
                                                <div className="text-sm font-bold text-pink-300">👚 {agentIdea.outfit_idea}</div>
                                            </div>
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                                <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Hair Style</div>
                                                <div className="text-sm font-bold text-blue-300">💇‍♀️ {agentIdea.hairstyle_idea}</div>
                                            </div>
                                        </div>

                                        <p className="text-sm text-zinc-300 leading-relaxed border-l-2 border-purple-500/30 pl-4 py-1">
                                            {agentIdea.reasoning}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Strategy Bias */}
                    <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem]">
                        <h3 className="text-xs font-black text-zinc-500 uppercase mb-4">策略權重 (Strategy Bias)</h3>
                        <div className="space-y-4">
                             {Object.entries(memory.strategy_bias).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-4">
                                   <span className="text-[10px] uppercase w-20 text-zinc-400 font-bold">{k}</span>
                                   <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                                      <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${(v as number) * 100}%` }}></div>
                                   </div>
                                   <span className="text-[10px] font-mono text-white">{((v as number) * 100).toFixed(0)}%</span>
                                </div>
                             ))}
                        </div>
                    </div>
                    
                    {/* History */}
                    <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem]">
                        <h3 className="text-xs font-black text-zinc-500 uppercase mb-4">長期記憶 (Last 3 Episodes)</h3>
                        <div className="space-y-3">
                            {memory.history.slice(0, 3).map((h, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <div className="truncate text-xs text-zinc-300 font-bold">{h.topic}</div>
                                </div>
                            ))}
                            {memory.history.length === 0 && <div className="text-xs text-zinc-600 italic">尚無記憶數據</div>}
                        </div>
                    </div>
                 </div>
            </div>
        )}

        {/* === TAB 3: STUDIO (Placeholder for original studio) === */}
        {activeTab === 'studio' && (
             <div className="flex flex-col items-center justify-center py-20 bg-zinc-950 border border-zinc-800 rounded-[3rem] border-dashed">
                 <div className="text-4xl mb-4">🎬</div>
                 <p className="text-zinc-500 text-sm font-bold uppercase">請使用左側導航欄返回舊版手動導演模式</p>
                 <button onClick={() => setActiveTab('profile')} className="mt-4 text-purple-400 underline text-xs">回到檔案設定</button>
             </div>
        )}

      </div>
    </div>
  );
};
