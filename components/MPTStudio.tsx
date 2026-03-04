import React, { useState } from 'react';
import { ChannelConfig, ScriptData } from '../types';

interface MPTStudioProps {
  channel: ChannelConfig;
  onBack: () => void;
  isEmbedded?: boolean;
}

export const MPTStudio: React.FC<MPTStudioProps> = ({ channel, onBack, isEmbedded = false }) => {
  const [script, setScript] = useState<ScriptData | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [config, setConfig] = useState({
    bgmVolume: 0.1,
    fontSize: 80,
    subtitleColor: '#FFFF00',
    voiceId: 'Puck',
    videoEngine: 'veo' as 'veo' | 'sora' | 'jimeng' | 'heygen',
    useStockFootage: true
  });

  const [uploadTargets, setUploadTargets] = useState<string[]>([]);
  
  // Topic State
  const [topicMode, setTopicMode] = useState<'custom' | 'trend' | 'ai'>('custom');
  const [customTopic, setCustomTopic] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const fetchAiSuggestions = async () => {
    setIsSuggesting(true);
    try {
        const res = await fetch('/api/pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage: 'suggest_topics', channel })
        });
        const data = await res.json();
        if (data.success) {
            setAiSuggestions(data.topics);
            setTopicMode('ai');
        } else {
            setLog("建議失敗: " + data.error);
        }
    } catch(e: any) {
        setLog("建議錯誤: " + e.message);
    } finally {
        setIsSuggesting(false);
    }
  };

  const generateScript = async () => {
    if (!customTopic && topicMode === 'custom') {
        setLog("請輸入主題！");
        return;
    }

    const finalTopic = customTopic || channel.niche;

    setLoading(true);
    setLog(`正在使用 Gemini 生成腳本 (主題: ${finalTopic})...`);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stage: 'generate_script', 
            channel,
            topic: finalTopic // Pass the specific topic
        })
      });
      const data = await res.json();
      if (data.success) {
        setScript(data.script);
        setLog("腳本與元數據已生成！");
      } else {
        setLog("錯誤: " + data.error);
      }
    } catch (e: any) {
      setLog("錯誤: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadToPlatform = async (platform: string, videoDataUri: string, metadata: any) => {
      setLog(`正在上傳至 ${platform}...`);
      try {
          const res = await fetch('/api/upload_video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoUrl: videoDataUri,
                  auth: channel.auth, // Pass auth (contains YT tokens)
                  metadata: {
                      title: metadata.title,
                      desc: metadata.description
                  },
                  platform
              })
          });
          const data = await res.json();
          if (data.success) {
              setLog(`✅ 已上傳至 ${platform}: ${data.url || data.videoId}`);
          } else {
              setLog(`❌ 上傳失敗至 ${platform}: ${data.error}`);
          }
      } catch (e: any) {
          setLog(`❌ 上傳錯誤至 ${platform}: ${e.message}`);
      }
  };

  const renderVideo = async () => {
    if (!script) return;
    setLoading(true);
    setLog(`正在渲染影片 (模式: ${config.useStockFootage ? '混合模式 (素材庫 + AI)' : config.videoEngine})...`);
    
    // Update channel config temporarily for this render
    const tempChannel = { 
      ...channel, 
      mptConfig: config,
      uploadTargets: [] // No upload during render phase
    };

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_mpt', channel: tempChannel, scriptData: script })
      });
      const data = await res.json();
      
      if (data.success) {
        const url = data.videoUrl;
        setVideoUrl(url);
        setLog("渲染完成！請預覽影片並確認發布。");
        setLoading(false);
      } else {
        setLog("錯誤: " + data.error);
        setLoading(false);
      }
    } catch (e: any) {
      setLog("錯誤: " + e.message);
      setLoading(false);
    }
  };

  const publishVideo = async () => {
      if (!videoUrl || !script) return;
      
      if (uploadTargets.length === 0) {
          setLog("請至少選擇一個上傳目標！");
          return;
      }

      setLoading(true);
      setLog("準備發布...");

      try {
        // Convert video to Base64 Data URI
        const blob = await fetch(videoUrl).then(r => r.blob());
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            
            for (const target of uploadTargets) {
                await uploadToPlatform(target, base64data, script.socialMediaCopy || { title: script.title, description: script.title });
            }
            setLog("所有發布任務已完成！");
            setLoading(false);
        };
      } catch (e: any) {
          setLog("發布準備錯誤: " + e.message);
          setLoading(false);
      }
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen bg-black p-8'} text-white font-sans`}>
      <div className={`${isEmbedded ? '' : 'max-w-6xl mx-auto'} space-y-8`}>
        {/* Header - Only show if not embedded */}
        {!isEmbedded && (
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="text-zinc-400 hover:text-white transition">
              ← 返回
            </button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
              MPT 創作室: {channel.name}
            </h1>
          </div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ... content ... */}
          {/* Left: Script & Config */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-xl font-semibold mb-4">1. 大腦 (腳本)</h2>
              
              <div className="space-y-3 mb-4">
                <label className="text-xs font-bold text-zinc-400 uppercase">創作主題</label>
                
                {/* Topic Mode Switcher */}
                <div className="flex bg-black rounded-lg p-1 border border-zinc-800 mb-2">
                    <button 
                        onClick={() => setTopicMode('custom')}
                        className={`flex-1 py-2 text-xs font-bold rounded-md transition ${topicMode === 'custom' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                        自訂
                    </button>
                    <button 
                        onClick={() => { setTopicMode('ai'); if(aiSuggestions.length === 0) fetchAiSuggestions(); }}
                        className={`flex-1 py-2 text-xs font-bold rounded-md transition ${topicMode === 'ai' ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}
                    >
                        AI 靈感
                    </button>
                </div>

                {/* Custom Input */}
                {topicMode === 'custom' && (
                    <textarea 
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        placeholder={`輸入您想創作的主題... (預設: ${channel.niche})`}
                        className="w-full h-24 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white focus:border-indigo-500 outline-none resize-none"
                    />
                )}

                {/* AI Suggestions */}
                {topicMode === 'ai' && (
                    <div className="space-y-2">
                        {isSuggesting ? (
                            <div className="text-center py-4 text-xs text-purple-400 animate-pulse">正在分析頻道數據與趨勢...</div>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {aiSuggestions.map((topic, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCustomTopic(topic)}
                                        className={`w-full text-left p-3 rounded-xl text-xs border transition-all ${customTopic === topic ? 'bg-purple-900/30 border-purple-500 text-white' : 'bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                                    >
                                        {topic}
                                    </button>
                                ))}
                                <button 
                                    onClick={fetchAiSuggestions}
                                    className="w-full py-2 text-xs text-zinc-500 hover:text-white border border-dashed border-zinc-800 rounded-xl hover:border-zinc-600 transition"
                                >
                                    🔄 重新生成建議
                                </button>
                            </div>
                        )}
                    </div>
                )}
              </div>

              <button
                onClick={generateScript}
                disabled={loading || (topicMode === 'custom' && !customTopic && !channel.niche)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition disabled:opacity-50"
              >
                {loading ? "處理中..." : "生成腳本與元數據"}
              </button>
            </div>

            {/* Config Panel */}
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-xl font-semibold">2. 架構 (配置)</h2>
              
              {/* Source Toggle */}
              <div className="flex bg-black rounded-lg p-1 border border-zinc-800">
                  <button 
                    onClick={() => setConfig({...config, useStockFootage: true})}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition ${config.useStockFootage ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                  >
                    混合模式 (素材庫 + AI)
                  </button>
                  <button 
                    onClick={() => setConfig({...config, useStockFootage: false})}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition ${!config.useStockFootage ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}
                  >
                    純 AI 生成
                  </button>
              </div>

              <div className="animate-fade-in">
                <label className="text-xs text-purple-400 block mb-1 font-bold">
                    {config.useStockFootage ? '替補 AI 引擎 (當找不到素材時)' : '主要 AI 影片引擎'}
                </label>
                <select 
                  value={config.videoEngine}
                  onChange={(e) => setConfig({...config, videoEngine: e.target.value as any})}
                  className="w-full bg-black border border-purple-500/30 rounded-lg p-2 text-sm text-white focus:border-purple-500 outline-none"
                >
                  <option value="veo">Google Veo 3.1 (推薦)</option>
                  <option value="sora">OpenAI Sora 2.0 (測試版)</option>
                  <option value="jimeng">Jimeng (即夢)</option>
                  <option value="heygen">HeyGen (Digital Twin)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">背景音樂音量 ({config.bgmVolume})</label>
                <input 
                  type="range" min="0" max="1" step="0.1" 
                  value={config.bgmVolume}
                  onChange={(e) => setConfig({...config, bgmVolume: parseFloat(e.target.value)})}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">字體大小 ({config.fontSize}px)</label>
                <input 
                  type="range" min="12" max="120" step="2" 
                  value={config.fontSize}
                  onChange={(e) => setConfig({...config, fontSize: parseInt(e.target.value)})}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">字幕顏色</label>
                <div className="flex gap-2">
                    {['#FFFF00', '#FFFFFF', '#00FFFF', '#FF00FF', '#00FF00'].map(color => (
                        <button 
                            key={color}
                            onClick={() => setConfig({...config, subtitleColor: color})}
                            className={`w-6 h-6 rounded-full border-2 ${config.subtitleColor === color ? 'border-white' : 'border-transparent'}`}
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* Middle: Script & Metadata */}
          <div className="lg:col-span-4 space-y-6">
             {script && (
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-full flex flex-col">
                <h2 className="text-xl font-semibold mb-4">4. 靈魂 (內容)</h2>
                
                {/* Metadata Card */}
                {script.socialMediaCopy && (
                    <div className="bg-black/40 p-4 rounded-xl border border-zinc-800 mb-4 space-y-3">
                        <div className="text-xs font-bold text-purple-400 uppercase">社群媒體元數據</div>
                        <div>
                            <div className="text-[10px] text-zinc-500 uppercase">標題</div>
                            <div className="text-sm font-bold text-white">{script.socialMediaCopy.title}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-zinc-500 uppercase">描述</div>
                            <div className="text-xs text-zinc-400 whitespace-pre-wrap">{script.socialMediaCopy.description}</div>
                        </div>
                         <div>
                            <div className="text-[10px] text-zinc-500 uppercase">標籤</div>
                            <div className="text-xs text-blue-400">{script.socialMediaCopy.hashtags.join(' ')}</div>
                        </div>
                    </div>
                )}

                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {script.scenes.map((scene) => (
                    <div key={scene.id} className="p-4 bg-black/40 rounded-xl border border-zinc-800">
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-mono text-zinc-500">場景 {scene.id}</span>
                      </div>
                      <p className="text-sm text-zinc-300 mb-2">"{scene.narration}"</p>
                      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded w-fit">
                        <span>👁️ {scene.visual_cue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Preview & Render */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 min-h-[400px] flex flex-col items-center justify-center">
              {videoUrl ? (
                <div className="w-full aspect-[9/16] bg-black rounded-lg overflow-hidden relative group">
                  <video 
                    src={videoUrl} 
                    controls 
                    className="w-full h-full object-contain" 
                    autoPlay 
                    loop 
                  />
                  <a 
                    href={videoUrl} 
                    download 
                    className="absolute bottom-4 right-4 bg-white text-black px-4 py-2 rounded-full text-sm font-bold opacity-0 group-hover:opacity-100 transition"
                  >
                    下載
                  </a>
                </div>
              ) : (
                <div className="text-center text-zinc-500">
                  <div className="text-4xl mb-4">🎬</div>
                  <p>預覽將顯示於此</p>
                </div>
              )}
            </div>

            {/* Render Button */}
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <button
                    onClick={renderVideo}
                    disabled={loading || !script}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black uppercase tracking-widest transition disabled:opacity-50 shadow-lg shadow-indigo-900/20 mb-4"
                >
                    {loading && !videoUrl ? "渲染中..." : "🎬 開始渲染影片"}
                </button>

                {/* Publish Section - Only shows after render */}
                {videoUrl && (
                    <div className="animate-fade-in border-t border-zinc-800 pt-4 mt-4">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase mb-3">發布設定</h3>
                        <div className="flex gap-4 mb-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={uploadTargets.includes('youtube')}
                                    onChange={e => e.target.checked ? setUploadTargets([...uploadTargets, 'youtube']) : setUploadTargets(uploadTargets.filter(t => t !== 'youtube'))}
                                    className="w-4 h-4 accent-red-500" 
                                />
                                <span className="text-sm font-bold">YouTube</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={uploadTargets.includes('instagram')}
                                    onChange={e => e.target.checked ? setUploadTargets([...uploadTargets, 'instagram']) : setUploadTargets(uploadTargets.filter(t => t !== 'instagram'))}
                                    className="w-4 h-4 accent-pink-500" 
                                />
                                <span className="text-sm font-bold">Instagram</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={uploadTargets.includes('facebook')}
                                    onChange={e => e.target.checked ? setUploadTargets([...uploadTargets, 'facebook']) : setUploadTargets(uploadTargets.filter(t => t !== 'facebook'))}
                                    className="w-4 h-4 accent-blue-500" 
                                />
                                <span className="text-sm font-bold">Facebook</span>
                            </label>
                        </div>

                        <button
                            onClick={publishVideo}
                            disabled={loading || uploadTargets.length === 0}
                            className="w-full py-4 bg-pink-600 hover:bg-pink-500 rounded-xl font-black uppercase tracking-widest transition disabled:opacity-50 shadow-lg shadow-pink-900/20"
                        >
                            {loading ? "發布中..." : "🚀 確認並發布"}
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-black font-mono text-xs text-zinc-400 p-4 rounded-xl border border-zinc-800 h-32 overflow-y-auto">
              <div className="text-zinc-500 mb-2">系統日誌:</div>
              {log && <div className="text-emerald-400">&gt; {log}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
