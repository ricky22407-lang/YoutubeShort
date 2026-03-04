
import React, { useState, useEffect } from 'react';
import { ChannelConfig } from '../types';
import { MPTStudio } from './MPTStudio';

interface CreativeStudioProps {
  onBack: () => void;
  channels: ChannelConfig[];
  setChannels: React.Dispatch<React.SetStateAction<ChannelConfig[]>>;
}

export const CreativeStudio: React.FC<CreativeStudioProps> = ({ onBack, channels, setChannels }) => {
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'creation' | 'automation'>('dashboard');
  const [channel, setChannel] = useState<ChannelConfig | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Initialize selection
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels]);

  // Update local channel state when selection changes
  useEffect(() => {
    const ch = channels.find(c => c.id === selectedChannelId);
    if (ch) {
        setChannel(ch);
    }
  }, [selectedChannelId, channels]);

  const updateChannel = (updates: Partial<ChannelConfig>) => {
      if (!channel) return;
      const updated = { ...channel, ...updates };
      setChannel(updated);
      setChannels(prev => prev.map(c => c.id === channel.id ? updated : c));
  };

  const generateReport = async () => {
    if (!channel) return;
    setReportLoading(true);
    try {
        const res = await fetch('/api/pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage: 'generate_optimization_report', channel })
        });
        const data = await res.json();
        if (data.success) {
            updateChannel({ optimizationReport: data.report });
        } else {
            console.error(data.error);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setReportLoading(false);
    }
  };

  if (!channel) return <div className="text-white p-8">Loading Studio...</div>;

  return (
    <div className="min-h-screen bg-black text-white font-sans p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-zinc-800 transition-colors">←</button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              創作中心
            </h1>
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">生產與自動化</p>
          </div>
        </div>
        
        <select 
            value={selectedChannelId} 
            onChange={e => setSelectedChannelId(e.target.value)} 
            className="bg-zinc-900 border border-zinc-800 py-2 px-4 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
        >
            {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Navigation Tabs */}
      <div className="flex justify-center mb-8">
         <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md">
             {[
               { id: 'dashboard', icon: '📊', label: '儀表板' },
               { id: 'creation', icon: '🎬', label: '創作' },
               { id: 'automation', icon: '🤖', label: '自動化' }
             ].map(tab => (
                 <button 
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id as any)} 
                   className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-zinc-100 text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
                 >
                   <span>{tab.icon}</span>
                   <span>{tab.label}</span>
                 </button>
             ))}
         </div>
      </div>

      <div className="max-w-7xl mx-auto">
        
        {/* === TAB 1: DASHBOARD === */}
        {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-down">
                {/* Stats Cards */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase mb-4">總觀看數</h3>
                    <div className="text-4xl font-black text-white">0</div>
                    <div className="text-xs text-green-500 mt-2">↑ 0% 本週</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase mb-4">訂閱人數</h3>
                    <div className="text-4xl font-black text-white">0</div>
                    <div className="text-xs text-zinc-500 mt-2">+0 新增</div>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase mb-4">互動率</h3>
                    <div className="text-4xl font-black text-white">0%</div>
                    <div className="text-xs text-zinc-500 mt-2">平均續看率 0:00</div>
                </div>

                {/* Optimization Report */}
                <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white">📢 AI 優化報告</h3>
                        <button 
                            onClick={generateReport}
                            disabled={reportLoading}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition disabled:opacity-50"
                        >
                            {reportLoading ? '分析中...' : '生成新報告'}
                        </button>
                    </div>

                    {channel.optimizationReport ? (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center gap-4">
                                <div className="text-4xl font-black text-indigo-400">{channel.optimizationReport.channelHealthScore}</div>
                                <div className="text-xs text-zinc-500 uppercase font-bold">頻道健康度</div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-green-400 uppercase">關鍵洞察</h4>
                                    <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
                                        {channel.optimizationReport.keyInsights.map((insight, i) => (
                                            <li key={i}>{insight}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-blue-400 uppercase">策略建議</h4>
                                    <p className="text-sm text-zinc-300 leading-relaxed">
                                        {channel.optimizationReport.strategicAdvice}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-pink-400 uppercase">建議行動</h4>
                                <div className="flex flex-wrap gap-2">
                                    {channel.optimizationReport.suggestedActions.map((action, i) => (
                                        <span key={i} className="px-3 py-1 bg-pink-900/30 border border-pink-500/30 rounded-full text-xs text-pink-200">
                                            {action}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="text-[10px] text-zinc-600 text-right">
                                生成時間: {new Date(channel.optimizationReport.generatedAt).toLocaleString()}
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 bg-indigo-900/20 border border-indigo-500/30 rounded-xl text-indigo-200 text-sm leading-relaxed text-center">
                            尚未生成報告。請點擊上方按鈕分析您的頻道表現與市場趨勢。
                        </div>
                    )}
                </div>

                {/* Trends */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white">🔥 目前趨勢</h3>
                        <span className="text-[10px] text-zinc-600 font-mono">每日 24:00 更新</span>
                    </div>
                    <ul className="space-y-3">
                        {channel.optimizationReport?.trendingTopics ? (
                            channel.optimizationReport.trendingTopics.map((trend, i) => (
                                <li key={i} className="text-sm text-zinc-400">#{trend.replace(/\s+/g, '')}</li>
                            ))
                        ) : (
                            <>
                                <li className="text-sm text-zinc-400">#AIArt</li>
                                <li className="text-sm text-zinc-400">#ShortsChallenge</li>
                                <li className="text-sm text-zinc-400">#TechReview</li>
                            </>
                        )}
                    </ul>
                </div>
            </div>
        )}

        {/* === TAB 2: CREATION (MPTStudio) === */}
        {activeTab === 'creation' && (
            <div className="animate-slide-down">
                <MPTStudio 
                    channel={channel} 
                    onBack={() => {}} 
                />
            </div>
        )}

        {/* === TAB 3: AUTOMATION (Auto-Pilot) === */}
        {activeTab === 'automation' && (
            <div className="max-w-3xl mx-auto animate-slide-down">
                <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl space-y-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-white">自動導航配置</h2>
                            <p className="text-xs text-zinc-500">排程自動內容生成與發布。</p>
                        </div>
                        <div 
                            className={`w-14 h-8 rounded-full p-1 cursor-pointer transition-colors ${channel.autoPilot?.enabled ? 'bg-cyan-500' : 'bg-zinc-700'}`} 
                            onClick={() => updateChannel({ autoPilot: { ...channel.autoPilot, enabled: !channel.autoPilot?.enabled } })}
                        >
                            <div className={`w-6 h-6 bg-white rounded-full transition-transform shadow-md ${channel.autoPilot?.enabled ? 'translate-x-6' : ''}`} />
                        </div>
                    </div>
                    
                    {channel.autoPilot?.enabled && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Production Mode */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs text-zinc-500 font-bold uppercase block mb-2">生產模式</label>
                                    <select 
                                        value={channel.autoPilot?.mode || 'hybrid'}
                                        onChange={(e) => updateChannel({ autoPilot: { ...channel.autoPilot, mode: e.target.value as any } })}
                                        className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm text-white outline-none focus:border-cyan-500"
                                    >
                                        <option value="hybrid">混合模式 (素材庫優先 + AI 替補)</option>
                                        <option value="ai_only">純 AI 生成 (全自動)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 font-bold uppercase block mb-2">AI 引擎選擇</label>
                                    <select 
                                        value={channel.autoPilot?.engine || 'veo'}
                                        onChange={(e) => updateChannel({ autoPilot: { ...channel.autoPilot, engine: e.target.value as any } })}
                                        className="w-full bg-black border border-zinc-800 p-3 rounded-xl text-sm text-white outline-none focus:border-cyan-500"
                                    >
                                        <option value="veo">Google Veo 3.1 (推薦)</option>
                                        <option value="sora">OpenAI Sora 2.0</option>
                                        <option value="jimeng">Jimeng (即夢)</option>
                                        <option value="heygen">HeyGen (Digital Twin)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Schedule */}
                            <div>
                                <label className="text-xs text-zinc-500 font-bold uppercase block mb-3">每週發布日</label>
                                <div className="flex gap-2">
                                    {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => {
                                                const currentDays = channel.autoPilot?.days || [];
                                                const newDays = currentDays.includes(i) 
                                                    ? currentDays.filter(day => day !== i)
                                                    : [...currentDays, i];
                                                updateChannel({ autoPilot: { ...channel.autoPilot, days: newDays } });
                                            }}
                                            className={`w-10 h-10 rounded-full text-xs font-bold transition-all ${channel.autoPilot?.days?.includes(i) ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-zinc-500 font-bold uppercase block mb-3">發布時間 (24h)</label>
                                <input 
                                    type="time" 
                                    value={channel.autoPilot?.postTime || '20:00'}
                                    onChange={(e) => updateChannel({ autoPilot: { ...channel.autoPilot, postTime: e.target.value } })}
                                    className="bg-black border border-zinc-800 p-3 rounded-xl text-sm font-mono text-white outline-none focus:border-cyan-500 w-full md:w-48"
                                />
                            </div>

                            <div className="p-4 bg-cyan-900/20 border border-cyan-500/30 rounded-xl flex gap-4 items-start mt-6">
                                <div className="text-xl">💡</div>
                                <div>
                                    <h4 className="text-sm font-bold text-cyan-200 mb-1">自動導航邏輯</h4>
                                    <p className="text-xs text-cyan-200/70 leading-relaxed">
                                        系統將於每週指定時間自動執行。
                                        <br/>
                                        模式: <span className="text-white font-bold">{channel.autoPilot?.mode === 'ai_only' ? '純 AI 生成' : '混合模式'}</span>
                                        <br/>
                                        引擎: <span className="text-white font-bold">{channel.autoPilot?.engine?.toUpperCase()}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
