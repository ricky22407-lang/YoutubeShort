
import React, { useState, useRef, useEffect } from 'react';
import { CharacterProfile, ChannelConfig, AgentMemory, VideoLog } from '../types';
import { AgentBrain } from '../services/agentBrain'; // 假設這是在前端可用的服務或透過 API

interface CharacterStudioProps {
  onBack: () => void;
  channels: ChannelConfig[];
  setChannels: React.Dispatch<React.SetStateAction<ChannelConfig[]>>;
}

const CAMERA_ANGLES = [
  { id: 'close_up', label: '特寫 (Face/ASMR)', desc: '聚焦於臉部與表情' },
  { id: 'waist_up', label: '半身 (Vlog/訪談)', desc: '標準半身鏡頭' },
  { id: 'full_body', label: '全身 (OOTD/舞蹈)', desc: '展示全身穿搭與動作' }
];

export const CharacterStudio: React.FC<CharacterStudioProps> = ({ onBack, channels, setChannels }) => {
  const [character, setCharacter] = useState<CharacterProfile>({
    id: 'char_1',
    name: 'AI Agent 01',
    description: '一位充滿好奇心的 AI 實習生，喜歡觀察人類行為，風格自然、有點迷糊，影片風格通常是手持鏡頭的 Vlog。',
    images: {}
  });

  const [activeTab, setActiveTab] = useState<'create' | 'brain'>('create');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [memory, setMemory] = useState<AgentMemory>({ history: [], strategy_bias: { dance: 0.25, vlog: 0.25, skit: 0.25, challenge: 0.25 } });
  
  // Agent Thinking State
  const [isThinking, setIsThinking] = useState(false);
  const [agentIdea, setAgentIdea] = useState<{topic: string, reasoning: string} | null>(null);

  // Load Channel & Memory
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
      if (channels[0].characterProfile) setCharacter(channels[0].characterProfile);
      if (channels[0].agentMemory) setMemory(channels[0].agentMemory);
    }
  }, [channels]);

  useEffect(() => {
    const ch = channels.find(c => c.id === selectedChannelId);
    if (ch) {
      if (ch.characterProfile) setCharacter(ch.characterProfile);
      if (ch.agentMemory) setMemory(ch.agentMemory);
      else setMemory(AgentBrain.initMemory()); // Init if empty
    }
  }, [selectedChannelId]);

  // Actions
  const handleAgentThink = async () => {
    setIsThinking(true);
    setAgentIdea(null);
    try {
        // 模擬從後端或服務獲取趨勢
        const mockTrends = [{ id: '1', title: 'Viral Dance Challenge', hashtags: [], view_count: 1000000, view_growth_rate: 5 }];
        
        const decision = await AgentBrain.think(character, memory, mockTrends);
        setAgentIdea(decision);
        
        // 自動更新 Input (讓使用者可以選擇是否採納)
        // 這裡我們只是展示用
    } catch (e) {
        alert("Agent Thinking Failed");
    } finally {
        setIsThinking(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'fullBody' | 'side') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharacter(prev => ({ ...prev, images: { ...prev.images, [type]: reader.result as string } }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveConfig = () => {
     setChannels(prev => prev.map(c => c.id === selectedChannelId ? { ...c, characterProfile: character, agentMemory: memory } : c));
     alert("角色與記憶設定已儲存！");
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-purple-900/30 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-zinc-800 transition-colors">←</button>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              AI 代理人控制台 (Agent Console)
            </h1>
            <p className="text-xs text-purple-400/60 font-mono tracking-widest uppercase">自主經營系統 V9.0</p>
          </div>
        </div>
        <div className="flex bg-zinc-900 rounded-full p-1">
             <button onClick={() => setActiveTab('create')} className={`px-6 py-2 rounded-full text-xs font-black transition-all ${activeTab === 'create' ? 'bg-white text-black' : 'text-zinc-500'}`}>導演模式</button>
             <button onClick={() => setActiveTab('brain')} className={`px-6 py-2 rounded-full text-xs font-black transition-all ${activeTab === 'brain' ? 'bg-purple-600 text-white' : 'text-zinc-500'}`}>大腦與記憶 (Brain)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Config */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
              <label className="text-xs font-black text-zinc-500 uppercase">當前頻道</label>
              <select value={selectedChannelId} onChange={e => setSelectedChannelId(e.target.value)} className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm font-bold outline-none">
                 {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
           </div>

           <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
              <h2 className="text-xs font-black text-purple-500 uppercase tracking-widest">角色人格 (Persona Constitution)</h2>
              <textarea 
                 value={character.description}
                 onChange={e => setCharacter({...character, description: e.target.value})}
                 className="w-full h-40 bg-black border border-zinc-800 p-4 rounded-xl text-xs leading-relaxed text-zinc-300 outline-none focus:border-purple-500"
                 placeholder="描述 AI 的性格、說話方式、喜歡的主題..."
              />
              <div className="text-[10px] text-zinc-600">
                 * 這段描述將直接影響 Agent Brain 的決策邏輯。
              </div>
           </div>

           <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-[2rem] space-y-4">
              <h2 className="text-xs font-black text-cyan-500 uppercase tracking-widest">外觀設定 (Appearance)</h2>
               <div className="grid grid-cols-2 gap-2">
                 {['front', 'fullBody'].map(type => (
                    <div key={type} className="aspect-[3/4] bg-zinc-900 rounded-xl relative overflow-hidden border border-zinc-800 group cursor-pointer">
                        {character.images[type as keyof typeof character.images] ? (
                             <img src={character.images[type as keyof typeof character.images]} className="w-full h-full object-cover" />
                        ) : (
                             <div className="absolute inset-0 flex items-center justify-center text-zinc-700 font-bold text-[10px] uppercase">Upload {type}</div>
                        )}
                        <input type="file" className="hidden" onChange={e => handleImageUpload(e, type as any)} />
                    </div>
                 ))}
               </div>
           </div>
           
           <button onClick={saveConfig} className="w-full py-4 bg-white text-black font-black uppercase rounded-xl hover:bg-zinc-200">儲存設定</button>
        </div>

        {/* Right Column: View */}
        <div className="lg:col-span-8">
           {activeTab === 'create' ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600 space-y-4 bg-zinc-950/50 rounded-[3rem] border border-zinc-900 border-dashed">
                 <div className="text-4xl">🎬</div>
                 <p className="text-xs font-black uppercase">請切換至「大腦與記憶」頁面來觀察 AI 自主運作</p>
              </div>
           ) : (
              <div className="space-y-6">
                 {/* Agent State Monitor */}
                 <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-[2rem] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-20 text-9xl">🧠</div>
                    <h2 className="text-2xl font-black italic mb-6">Agent Neural State</h2>
                    
                    <div className="flex gap-8 mb-8">
                       <div className="flex-1 bg-black/50 p-4 rounded-xl border border-zinc-800">
                          <div className="text-[10px] text-zinc-500 uppercase font-bold mb-2">Strategy Bias (偏好權重)</div>
                          <div className="space-y-2">
                             {Object.entries(memory.strategy_bias).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2">
                                   <span className="text-[10px] uppercase w-16 text-zinc-400">{k}</span>
                                   <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                                      <div className="h-full bg-purple-500" style={{ width: `${v * 100}%` }}></div>
                                   </div>
                                   <span className="text-[10px] font-mono text-purple-300">{(v * 100).toFixed(0)}%</span>
                                </div>
                             ))}
                          </div>
                       </div>
                       
                       <div className="flex-1 bg-black/50 p-4 rounded-xl border border-zinc-800 flex flex-col justify-center items-center gap-4">
                           <button 
                             onClick={handleAgentThink}
                             disabled={isThinking}
                             className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-xl transition-all ${isThinking ? 'bg-zinc-800 text-zinc-500 animate-pulse' : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:scale-105'}`}
                           >
                             {isThinking ? 'Thinking...' : 'Trigger Ideation (觸發思考)'}
                           </button>
                           {isThinking && <p className="text-[10px] text-cyan-400 animate-pulse">正在分析趨勢與回憶過去...</p>}
                       </div>
                    </div>

                    {/* Thought Bubble */}
                    {agentIdea && (
                        <div className="bg-gradient-to-br from-purple-900/20 to-black border border-purple-500/30 p-6 rounded-2xl animate-slide-down">
                            <div className="flex items-start gap-4">
                               <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center font-bold text-black">AI</div>
                               <div>
                                  <h3 className="font-bold text-purple-300 mb-1">💡 I have an idea!</h3>
                                  <p className="text-lg font-black italic text-white mb-2">"{agentIdea.topic}"</p>
                                  <p className="text-xs text-zinc-400 leading-relaxed border-l-2 border-purple-500/50 pl-3">
                                     {agentIdea.reasoning}
                                  </p>
                               </div>
                            </div>
                        </div>
                    )}
                 </div>

                 {/* Memory Log */}
                 <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-[2rem]">
                    <h2 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-6">Long-term Memory (History)</h2>
                    {memory.history.length === 0 ? (
                        <div className="text-center py-10 text-zinc-700 text-xs uppercase">Memory Empty (New Agent)</div>
                    ) : (
                        <div className="space-y-4">
                           {memory.history.map((log, i) => (
                              <div key={i} className="flex gap-4 p-4 bg-black rounded-xl border border-zinc-900">
                                 <div className="text-xs font-mono text-zinc-500">{log.timestamp}</div>
                                 <div>
                                    <div className="font-bold text-sm text-white">{log.topic}</div>
                                    <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">{log.category} • {log.reasoning}</div>
                                 </div>
                              </div>
                           ))}
                        </div>
                    )}
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};
