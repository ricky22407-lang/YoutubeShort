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
    avatarScale: 1.0, 
    targetDuration: '60', 
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
        setLog("圖片已載入，將用於生成腳本與影片。");
      };
      reader.readAsDataURL(file);
    }
  };

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
            targetDuration: config.targetDuration,
            referenceImage
        })
      });
      const data = await res.json();
      if (data.success) {
        setScript(data.script);
        setLog(`腳本生成完畢！共 ${data.script.scenes.length} 個場景。您可以直接修改文字！`);
      } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } 
    finally { setLoading(false); }
  };

  // 🚀 新增：允許使用者手動修改腳本的函式
  const handleSceneChange = (id: number, field: 'narration' | 'visual_cue', value: string) => {
    if (!script) return;
    const updatedScenes = script.scenes.map(scene => 
        scene.id === id ? { ...scene, [field]: value } : scene
    );
    setScript({ ...script, scenes: updatedScenes });
  };

  const uploadToPlatform = async (platform: string, videoDataUri: string, metadata: any) => {
      setLog(`正在上傳至 ${platform}...`);
      try {
          const res = await fetch('/api/upload_video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoUrl: videoDataUri,
                  auth: channel.auth, 
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
    if (config.videoEngine === 'heygen' && !config.heygenAvatarId) { setLog("⚠️ 請填寫 Avatar ID！"); return; }

    setLoading(true);
    setLog(`正在準備環境 (模式: ${config.videoEngine})...`);
    const tempChannel = { ...channel, mptConfig: config, uploadTargets: [] };

    try {
      let finalHeygenUrl = undefined;
      let preGeneratedSceneUrls: Record<number, string> = {};

      if (config.videoEngine === 'heygen' && config.heygenAvatarId) {
          setLog('正在提交 HeyGen 渲染任務...'); 
          const submitRes = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'heygen_submit', channel: tempChannel, scriptData: script }) }).then(r => r.json());
          if (!submitRes.success) throw new Error(submitRes.error || "提交失敗");
          
          setLog('HeyGen 雲端算圖中 (預計 3~5 分鐘，前 3 分鐘系統將暫停連線以節省資源)...');
          await new Promise(resolve => setTimeout(resolve, 180000)); 
          
          setLog('正在確認進度...');
          while (true) {
              const statusRes = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'heygen_status', videoId: submitRes.videoId }) }).then(r => r.json());
              if (statusRes.status === 'completed') { finalHeygenUrl = statusRes.videoUrl; break; } 
              else if (statusRes.status === 'failed' || statusRes.status === 'error') { throw new Error("渲染失敗。"); }
              await new Promise(resolve => setTimeout(resolve, 10000));
          }
      } else {
          setLog('啟動逐幕分散運算 (避免雲端超時)...');
          for (let i = 0; i < script.scenes.length; i++) {
              const scene = script.scenes[i];
              setLog(`正在運算第 ${i+1}/${script.scenes.length} 幕畫面...`);
              
              const isFirstSceneWithProduct = !!referenceImage && scene.id === 1;
              const sceneRes = await fetch('/api/pipeline', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                      stage: 'generate_single_video', 
                      visualCue: scene.visual_cue,
                      isFirstSceneWithProduct,
                      useStockFootage: config.useStockFootage,
                      videoEngine: config.videoEngine,
                      referenceImage: referenceImage || script.referenceImage 
                  })
              }).then(r => r.json());

              if (sceneRes.success) {
                  preGeneratedSceneUrls[scene.id] = sceneRes.videoUrl;
              } else {
                  throw new Error(`場景 ${scene.id} 生成失敗: ${sceneRes.error}`);
              }
          }
      }

      setLog('正在合成最終影片與字幕...');
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stage: 'render_mpt', 
            channel: tempChannel, 
            scriptData: { ...script, referenceImage: referenceImage || script.referenceImage },
            previousVideoUrl: videoUrl,
            preGeneratedHeygenUrl: finalHeygenUrl,
            preGeneratedSceneUrls 
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setVideoUrl(data.videoUrl);
        setLog("渲染完成！請預覽影片並確認發布。");
      } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } 
    finally { setLoading(false); }
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
                    <textarea value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder={`輸入主題... (預設: ${channel.niche})`} className="w-full h-24 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white outline-none resize-none" />
                )}
                {topicMode === 'ai' && (
                    <div className="space-y-2">
                        {isSuggesting ? (
                            <div className="text-center py-4 text-xs text-purple-400 animate-pulse">正在分析趨勢...</div>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {aiSuggestions.map((topic, idx) => (
                                    <button key={idx} onClick={() => setCustomTopic(topic)} className={`w-full text-left p-3 rounded-xl text-xs border ${customTopic === topic ? 'bg-purple-900/30 border-purple-500' : 'bg-black border-zinc-800 text-zinc-400'}`}>{topic}</button>
                                ))}
                                <button onClick={fetchAiSuggestions} className="w-full py-2 text-xs text-zinc-500 hover:text-white border border-dashed border-zinc-800 rounded-xl">🔄 重新生成</button>
                            </div>
                        )}
                    </div>
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

              {/* Image Upload Section */}
              <div className="mb-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-3">參考圖片 (Image-to-Video)</label>
                  <div className="flex items-center gap-4">
                      <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-4 rounded-lg text-xs font-bold transition flex items-center gap-2 border border-zinc-700">
                          <span>📷 上傳圖片</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                      
                      {referenceImage ? (
                          <div className="relative group w-16 h-16 shrink-0">
                              <img src={referenceImage} alt="Preview" className="w-full h-full object-cover rounded-md border border-zinc-600" />
                              <button 
                                  onClick={() => setReferenceImage(null)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow-md"
                              >
                                  ×
                              </button>
                          </div>
                      ) : (
                          <span className="text-[10px] text-zinc-500 italic">
                              上傳產品/場景圖，AI 將根據圖片生成腳本與影片
                          </span>
                      )}
                  </div>
              </div>

              <button onClick={generateScript} disabled={loading || (topicMode === 'custom' && !customTopic && !channel.niche)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition disabled:opacity-50">
                {loading ? "處理中..." : "生成腳本與元數據"}
              </button>
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-xl font-semibold">2. 架構 (配置)</h2>
              
              <div className="flex bg-black rounded-lg p-1 border border-zinc-800">
                  <button onClick={() => setConfig({...config, useStockFootage: true})} className={`flex-1 py-2 text-xs font-bold rounded-md ${config.useStockFootage ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>混合模式</button>
                  <button onClick={() => setConfig({...config, useStockFootage: false})} className={`flex-1 py-2 text-xs font-bold rounded-md ${!config.useStockFootage ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}>純 AI</button>
              </div>

              <div>
                <label className="text-xs text-purple-400 block mb-1 font-bold">影像生成引擎</label>
                <select value={config.videoEngine} onChange={(e) => setConfig({...config, videoEngine: e.target.value as any})} className="w-full bg-black border border-purple-500/30 rounded-lg p-2 text-sm text-white focus:border-purple-500 outline-none">
                  <option value="veo">Google Veo 3.1</option>
                  <option value="sora">OpenAI Sora 2.0</option>
                  <option value="jimeng">Jimeng</option>
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

              <div className="border-t border-zinc-800 my-4 pt-4"></div>

              {/* 👉 配音引擎與聲線選擇 */}
              <div>
                  <label className="text-xs text-zinc-400 block mb-1 font-bold">配音引擎</label>
                  <div className="flex bg-black rounded-lg p-1 border border-zinc-800 mb-2">
                     <button onClick={() => setConfig({...config, ttsEngine: 'edge', voiceId: 'zh-TW-HsiaoChenNeural'})} className={`flex-1 py-2 text-xs font-bold rounded-md ${config.ttsEngine === 'edge' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Edge (免費)</button>
                     <button onClick={() => setConfig({...config, ttsEngine: 'elevenlabs', voiceId: 'Puck'})} className={`flex-1 py-2 text-xs font-bold rounded-md ${config.ttsEngine === 'elevenlabs' ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}>ElevenLabs</button>
                  </div>

                  <label className="text-xs text-zinc-400 block mb-1">
                      {config.ttsEngine === 'elevenlabs' ? 'Voice ID (請輸入)' : '語音聲線 (請選擇)'}
                  </label>
                  {config.ttsEngine === 'elevenlabs' ? (
                      <input 
                          type="text" 
                          value={config.voiceId} 
                          onChange={e => setConfig({...config, voiceId: e.target.value})} 
                          placeholder="例如: Puck 或 21m00Tcm4..." 
                          className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none" 
                      />
                  ) : (
                      <select 
                          value={config.voiceId} 
                          onChange={e => setConfig({...config, voiceId: e.target.value})} 
                          className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none"
                      >
                          <option value="zh-TW-HsiaoChenNeural">曉辰 (台灣女聲)</option>
                          <option value="zh-TW-YunJheNeural">允哲 (台灣男聲)</option>
                          <option value="zh-TW-HsiaoYuNeural">曉雨 (台灣女聲)</option>
                      </select>
                  )}
              </div>

              <div className="border-t border-zinc-800 my-4 pt-4"></div>

              {/* 🚀 數值完美回歸區塊 */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">背景音樂音量 ({config.bgmVolume})</label>
                <input type="range" min="0" max="1" step="0.1" value={config.bgmVolume} onChange={(e) => setConfig({...config, bgmVolume: parseFloat(e.target.value)})} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">字體大小 ({config.fontSize}px)</label>
                <input type="range" min="12" max="120" step="2" value={config.fontSize} onChange={(e) => setConfig({...config, fontSize: parseInt(e.target.value)})} className="w-full" />
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

              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-bold">字幕字體</label>
                <select value={config.fontName} onChange={(e) => setConfig({...config, fontName: e.target.value})} className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none">
                  <optgroup label="中文 (Chinese)">
                    <option value="NotoSansTC-Bold.ttf">Noto Sans TC (黑體)</option>
                    <option value="NotoSerifTC-Bold.ttf">Noto Serif TC (宋體)</option>
                    <option value="ZCOOLKuaiLe-Regular.ttf">快樂體 (可愛)</option>
                  </optgroup>
                  <optgroup label="英文 (English)">
                    <option value="Roboto-Bold.ttf">Roboto (標準)</option>
                    <option value="Anton-Regular.ttf">Anton (衝擊感)</option>
                    <option value="Bangers-Regular.ttf">Bangers (漫畫風)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-bold">配樂風格 (BGM)</label>
                <select value={config.bgmMood} onChange={(e) => setConfig({...config, bgmMood: e.target.value as any})} className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none">
                  <option value="random">🎲 隨機 (Random)</option>
                  <option value="epic">⚔️ 史詩 (Epic)</option>
                  <option value="relaxing">☕ 輕鬆 (Relaxing)</option>
                  <option value="funny">🤡 搞笑 (Funny)</option>
                  <option value="suspense">🕵️ 懸疑 (Suspense)</option>
                  <option value="none">🔇 無配樂 (No BGM)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 中間：內容 */}
          <div className="lg:col-span-4 space-y-6">
             {script && (
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-full flex flex-col">
                <h2 className="text-xl font-semibold mb-4">4. 靈魂 (內容)</h2>
                {script.socialMediaCopy && (
                    <div className="bg-black/40 p-4 rounded-xl border border-zinc-800 mb-4 space-y-3">
                        <div className="text-xs font-bold text-purple-400 uppercase">社群媒體元數據</div>
                        <div><div className="text-[10px] text-zinc-500">標題</div><div className="text-sm font-bold">{script.socialMediaCopy.title}</div></div>
                        <div><div className="text-[10px] text-zinc-500">描述</div><div className="text-xs text-zinc-400">{script.socialMediaCopy.description}</div></div>
                    </div>
                )}
                <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                  {script.scenes.map((scene) => (
                    <div key={scene.id} className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-3">
                      <div className="text-xs font-mono text-zinc-500">場景 {scene.id}</div>
                      
                      {/* 🚀 改成可編輯的輸入框 */}
                      <div>
                          <label className="text-[10px] text-zinc-500 font-bold mb-1 block">配音台詞 (Narration)</label>
                          <textarea 
                              value={scene.narration}
                              onChange={(e) => handleSceneChange(scene.id, 'narration', e.target.value)}
                              className="w-full bg-zinc-900/50 border border-zinc-700/50 p-2 rounded-lg text-sm text-zinc-300 outline-none focus:border-indigo-500 transition-colors resize-none"
                              rows={2}
                          />
                      </div>

                      {/* 🚀 畫面提示詞也改成可編輯 */}
                      <div>
                          <label className="text-[10px] text-emerald-600 font-bold mb-1 block flex items-center gap-1">👁️ 畫面提示詞 (Visual Cue)</label>
                          <textarea 
                              value={scene.visual_cue}
                              onChange={(e) => handleSceneChange(scene.id, 'visual_cue', e.target.value)}
                              className="w-full bg-emerald-950/20 border border-emerald-900/30 p-2 rounded-lg text-xs text-emerald-400 outline-none focus:border-emerald-500 transition-colors resize-none"
                              rows={3}
                          />
                      </div>
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

                {videoUrl && (
                    <div className="border-t border-zinc-800 pt-4 mt-4">
                        <div className="flex gap-4 mb-6">
                            {['youtube', 'instagram', 'facebook'].map(platform => (
                                <label key={platform} className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={uploadTargets.includes(platform)}
                                        onChange={e => e.target.checked ? setUploadTargets([...uploadTargets, platform]) : setUploadTargets(uploadTargets.filter(t => t !== platform))}
                                    />
                                    <span className="text-sm font-bold capitalize">{platform}</span>
                                </label>
                            ))}
                        </div>
                        <button onClick={publishVideo} disabled={loading || uploadTargets.length === 0} className="w-full py-4 bg-pink-600 hover:bg-pink-500 rounded-xl font-black uppercase tracking-widest disabled:opacity-50">
                            🚀 確認並發布
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
