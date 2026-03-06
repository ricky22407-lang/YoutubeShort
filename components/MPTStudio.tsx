import React, { useState, useEffect } from 'react';
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
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const [config, setConfig] = useState({
    bgmVolume: 0.1,
    fontSize: 80,
    subtitleColor: '#FFFF00',
    ttsEngine: 'edge' as 'edge' | 'elevenlabs',
    voiceId: 'zh-TW-HsiaoChenNeural', 
    videoEngine: 'veo' as 'veo' | 'sora' | 'jimeng' | 'heygen',
    heygenAvatarId: '',
    avatarScale: 1.0, // 👈 新增：解決白邊的畫面縮放
    targetDuration: '60', // 👈 新增：目標時長
    useStockFootage: true,
    fontName: 'NotoSansTC-Bold.ttf',
    bgmMood: 'random' as 'random' | 'epic' | 'relaxing' | 'funny' | 'suspense' | 'none'
  });

  useEffect(() => {
    const savedConfig = localStorage.getItem(`mptConfig_${channel.id}`);
    if (savedConfig) {
      try { setConfig(JSON.parse(savedConfig)); } catch (e) {}
    }
  }, [channel.id]);

  useEffect(() => {
    localStorage.setItem(`mptConfig_${channel.id}`, JSON.stringify(config));
  }, [config, channel.id]);

  const [uploadTargets, setUploadTargets] = useState<string[]>([]);
  const [topicMode, setTopicMode] = useState<'custom' | 'trend' | 'ai'>('custom');
  const [customTopic, setCustomTopic] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const fetchAiSuggestions = async () => { /*...不變...*/ };
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { /*...不變...*/ };

  const generateScript = async () => {
    if (!customTopic && topicMode === 'custom') { setLog("請輸入主題！"); return; }
    const finalTopic = customTopic || channel.niche;
    setLoading(true);
    setLog(`正在生成腳本 (目標時長: ${config.targetDuration} 秒以內)...`);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stage: 'generate_script', 
            channel,
            topic: finalTopic,
            targetDuration: config.targetDuration, // 👈 傳遞時長需求
            referenceImage
        })
      });
      const data = await res.json();
      if (data.success) {
        setScript(data.script);
        setLog(`腳本生成完畢！共 ${data.script.scenes.length} 個場景。`);
      } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } 
    finally { setLoading(false); }
  };

  const renderVideo = async () => {
    if (!script) return;
    if (config.videoEngine === 'heygen' && !config.heygenAvatarId) { setLog("⚠️ 請填寫 Avatar ID！"); return; }

    setLoading(true);
    setLog(`正在準備環境 (模式: ${config.videoEngine})...`);
    const tempChannel = { ...channel, mptConfig: config, uploadTargets: [] };

    try {
      let finalHeygenUrl = undefined;
      if (config.videoEngine === 'heygen' && config.heygenAvatarId) {
          setLog('正在提交 HeyGen 渲染任務...'); 
          const submitRes = await fetch('/api/pipeline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stage: 'heygen_submit', channel: tempChannel, scriptData: script })
          }).then(r => r.json());
          
          if (!submitRes.success) throw new Error(submitRes.error || "提交失敗");
          
          setLog('HeyGen 雲端算圖中 (強制休眠 3 分鐘以節省資源)...');
          await new Promise(resolve => setTimeout(resolve, 180000)); 
          
          setLog('正在確認進度...');
          while (true) {
              const statusRes = await fetch('/api/pipeline', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage: 'heygen_status', videoId: submitRes.videoId })
              }).then(r => r.json());
              
              if (statusRes.status === 'completed') { finalHeygenUrl = statusRes.videoUrl; break; } 
              else if (statusRes.status === 'failed' || statusRes.status === 'error') { throw new Error("渲染失敗。"); }
              await new Promise(resolve => setTimeout(resolve, 10000));
          }
      }

      setLog('正在合成最終影片與字幕...');
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stage: 'render_mpt', 
            channel: tempChannel, 
            scriptData: script,
            previousVideoUrl: videoUrl,
            preGeneratedHeygenUrl: finalHeygenUrl 
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setVideoUrl(data.videoUrl);
        setLog("渲染完成！請預覽影片。");
      } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } 
    finally { setLoading(false); }
  };

  const publishVideo = async () => { /*...不變...*/ };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!videoUrl) return;
    setLog("正在準備下載檔案...");
    try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `youtube_short_${Date.now()}.mp4`; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
        setLog("✅ 下載成功！");
    } catch (error: any) { setLog("❌ 下載失敗: " + error.message); }
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen bg-black p-8'} text-white font-sans`}>
      <div className={`${isEmbedded ? '' : 'max-w-6xl mx-auto'} space-y-8`}>
        {!isEmbedded && (
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="text-zinc-400 hover:text-white transition">← 返回</button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">MPT 創作室: {channel.name}</h1>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左側：大腦 */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-xl font-semibold mb-4">1. 大腦 (腳本)</h2>
              <div className="space-y-3 mb-4">
                <label className="text-xs font-bold text-zinc-400 uppercase">創作主題</label>
                <div className="flex bg-black rounded-lg p-1 border border-zinc-800 mb-2">
                    <button onClick={() => setTopicMode('custom')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${topicMode === 'custom' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>自訂</button>
                    <button onClick={() => { setTopicMode('ai'); if(aiSuggestions.length === 0) fetchAiSuggestions(); }} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${topicMode === 'ai' ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}>AI 靈感</button>
                </div>
                {topicMode === 'custom' && (
                    <textarea value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder={`輸入主題...`} className="w-full h-24 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white outline-none resize-none" />
                )}
              </div>

              {/* 👉 時長選擇區塊 */}
              <div className="mb-4">
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-2">影片目標時長</label>
                  <select value={config.targetDuration} onChange={e => setConfig({...config, targetDuration: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded-lg text-sm text-white outline-none">
                      <option value="30">⏱️ 30秒以內 (極短影音 / 快節奏)</option>
                      <option value="60">⏳ 60秒以內 (標準短影音)</option>
                  </select>
              </div>

              <button onClick={generateScript} disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition disabled:opacity-50">
                {loading ? "處理中..." : "生成腳本與元數據"}
              </button>
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-xl font-semibold">2. 架構 (配置)</h2>
              
              <div>
                <label className="text-xs text-purple-400 block mb-1 font-bold">影像生成引擎</label>
                <select value={config.videoEngine} onChange={(e) => setConfig({...config, videoEngine: e.target.value as any})} className="w-full bg-black border border-purple-500/30 rounded-lg p-2 text-sm text-white focus:border-purple-500 outline-none">
                  <option value="veo">Google Veo 3.1</option>
                  <option value="heygen">HeyGen (數位人)</option>
                </select>
                
                {/* 👉 HeyGen 專屬動態輸入框與畫面控制 */}
                {config.videoEngine === 'heygen' && (
                   <div className="animate-fade-in mt-2 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg space-y-4">
                     {/* 群組盲抽輸入框 */}
                     <div>
                         <label className="text-xs text-indigo-400 block mb-1 font-bold">HeyGen Avatar / Group ID (支援群組盲抽)</label>
                         <input 
                            type="text" 
                            value={config.heygenAvatarId} 
                            onChange={e => setConfig({...config, heygenAvatarId: e.target.value})} 
                            placeholder="輸入 Group ID 或 Avatar ID..." 
                            className="w-full bg-black border border-indigo-500/50 p-2 rounded-lg text-sm text-white outline-none" 
                         />
                         <p className="text-[10px] text-indigo-300 mt-1">
                            ✨ 系統超智慧：輸入 Group ID 會自動列出底下所有 Looks 進行隨機盲抽換裝！也可以單純輸入單一 ID 喔。
                         </p>
                     </div>

                     {/* 畫面縮放控制區塊 (解決白邊) */}
                     <div>
                         <label className="text-xs text-indigo-400 block mb-1 font-bold">畫面放大比例 (去白邊): {config.avatarScale.toFixed(1)}x</label>
                         <input 
                            type="range" 
                            min="1" 
                            max="2.5" 
                            step="0.1" 
                            value={config.avatarScale} 
                            onChange={e => setConfig({...config, avatarScale: parseFloat(e.target.value)})} 
                            className="w-full" 
                         />
                         <p className="text-[10px] text-indigo-300 mt-1">若橫式影片上下有白邊，請調大數值放大畫面 (建議 1.5 ~ 1.8)</p>
                     </div>
                   </div>
                )}
              </div>

              {/* ... 其他字體、音樂設定保持現有 ... */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">背景音樂音量 ({config.bgmVolume})</label>
                <input type="range" min="0" max="1" step="0.1" value={config.bgmVolume} onChange={(e) => setConfig({...config, bgmVolume: parseFloat(e.target.value)})} className="w-full" />
              </div>
            </div>
          </div>

          {/* 中間：內容 */}
          <div className="lg:col-span-4 space-y-6">
             {script && (
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-full flex flex-col">
                <h2 className="text-xl font-semibold mb-4">4. 靈魂 (內容)</h2>
                <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                  {script.scenes.map((scene) => (
                    <div key={scene.id} className="p-4 bg-black/40 rounded-xl border border-zinc-800">
                      <div className="text-xs font-mono text-zinc-500 mb-2">場景 {scene.id}</div>
                      <p className="text-sm text-zinc-300 mb-2">"{scene.narration}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右側：預覽與發布 */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 min-h-[400px] flex flex-col items-center justify-center relative">
              {videoUrl ? (
                <div className="w-full space-y-4">
                  {/* 影片播放器保持乾淨 */}
                  <div className="w-full aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                    <video src={videoUrl} controls className="w-full h-full object-contain" autoPlay loop />
                  </div>
                  {/* 👉 獨立的巨型下載按鈕，移到播放器下方 */}
                  <button onClick={handleDownload} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 border border-zinc-700 shadow-lg">
                    ⬇️ 下載最終影片檔案
                  </button>
                </div>
              ) : (
                <div className="text-center text-zinc-500"><div className="text-4xl mb-4">🎬</div><p>預覽將顯示於此</p></div>
              )}
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <button onClick={renderVideo} disabled={loading || !script} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black uppercase tracking-widest disabled:opacity-50 mb-4">
                    {loading && !videoUrl ? "渲染中..." : "🎬 開始渲染影片"}
                </button>
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