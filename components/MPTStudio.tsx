import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScriptData } from '../types';

interface MPTStudioProps { channel: ChannelConfig; onBack: () => void; isEmbedded?: boolean; }

export const MPTStudio: React.FC<MPTStudioProps> = ({ channel, onBack, isEmbedded = false }) => {
  const [script, setScript] = useState<ScriptData | null>(null);
  const [treatment, setTreatment] = useState<any>(null); 
  const [sceneVideoCache, setSceneVideoCache] = useState<Record<number, string>>({});
  
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [productDescription, setProductDescription] = useState<string>("");
  const [videoType, setVideoType] = useState<'avatar' | 'product' | 'topic'>(channel.defaultVideoType || 'topic');

  const [config, setConfig] = useState({
    bgmVolume: 0.1, fontSize: 80, subtitleColor: '#FFFF00', ttsEngine: 'edge' as 'edge' | 'elevenlabs', voiceId: 'zh-CN-YunxiNeural', 
    videoEngine: channel.defaultVideoType === 'product' ? 'kling' : (channel.defaultVideoType === 'avatar' ? 'heygen' : 'veo'),
    heygenAvatarId: channel.mptConfig?.heygenAvatarId || '', avatarScale: 1.0, klingModelVersion: channel.defaultKlingModel || 'kling-3.0',
    targetDuration: '30', allowNoVoiceover: false, useStockFootage: channel.defaultVideoType === 'topic', fontName: 'NotoSansTC-Bold.ttf', bgmMood: 'random' as 'random' | 'epic' | 'relaxing' | 'funny' | 'suspense' | 'none'
  });

  useEffect(() => {
      setVideoType(channel.defaultVideoType || 'topic');
      setProductDescription(channel.defaultProductDescription || '');
      setConfig(prev => ({
          ...prev,
          videoEngine: channel.defaultVideoType === 'product' ? 'kling' : (channel.defaultVideoType === 'avatar' ? 'heygen' : 'veo'),
          klingModelVersion: channel.defaultKlingModel || 'kling-3.0', heygenAvatarId: channel.mptConfig?.heygenAvatarId || '', useStockFootage: channel.defaultVideoType === 'topic'
      }));
  }, [channel]);

  const [uploadTargets, setUploadTargets] = useState<string[]>([]);
  const [topicMode, setTopicMode] = useState<'custom' | 'trend' | 'ai'>('custom');
  const [customTopic, setCustomTopic] = useState("");

  const testSettings = async () => {
      setLoading(true); setLog("🔍 正在發送檢測請求，請稍候...");
      try {
          const res = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'test_config', mptConfig: config }) });
          const data = await res.json();
          if (data.success) setLog(data.logs.join('\n')); else setLog("❌ 檢測模組發生錯誤: " + data.error);
      } catch (e: any) { setLog("❌ 檢測連線失敗: " + e.message); } finally { setLoading(false); }
  };

  const handleVideoTypeChange = (type: 'avatar' | 'product' | 'topic') => {
      setVideoType(type);
      if (type === 'avatar') setConfig({...config, videoEngine: 'heygen', useStockFootage: false});
      if (type === 'product') setConfig({...config, videoEngine: 'kling', useStockFootage: false});
      if (type === 'topic') setConfig({...config, videoEngine: 'veo', useStockFootage: true});
      setScript(null); setTreatment(null); setSceneVideoCache({}); 
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
          const img = new Image();
          img.onload = () => {
              const MAX_DIMENSION = 1080;
              let width = img.width; let height = img.height;
              if (width > height && width > MAX_DIMENSION) { height = Math.round((height * MAX_DIMENSION) / width); width = MAX_DIMENSION; } 
              else if (height > MAX_DIMENSION) { width = Math.round((width * MAX_DIMENSION) / height); height = MAX_DIMENSION; }
              const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
                  const safeBase64 = canvas.toDataURL('image/jpeg', 0.8);
                  setReferenceImages(prev => [...prev, safeBase64]);
                  setLog(`✅ 圖片已壓縮並加入圖庫！大腦現在可以「看見」這張圖片了。`);
              }
          };
          img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (indexToRemove: number) => { setReferenceImages(prev => prev.filter((_, index) => index !== indexToRemove)); };

  const generateTreatment = async () => {
    if (!customTopic && topicMode === 'custom') { setLog("請輸入主題！"); return; }
    const finalTopic = customTopic || channel.niche;
    setLoading(true); setLog(`🧠 大腦正在分析圖片並構思企劃...`);
    setSceneVideoCache({});
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // 🚀 核心升級：將 referenceImages 送給大腦看
        body: JSON.stringify({ stage: 'generate_treatment', channel, topic: finalTopic, videoType, productDescription, targetDuration: config.targetDuration, allowNoVoiceover: config.allowNoVoiceover, referenceImages })
      });
      const data = await res.json();
      if (data.success) { setTreatment(data.treatment); setLog(`✅ 企劃書已產出！(已自動對齊圖片內容)`); } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };

  const generateFinalScript = async () => {
    setLoading(true); setLog(`🎬 導演已確認企劃，正在根據圖片撰寫分鏡腳本...`);
    setSceneVideoCache({}); 
    try {
      const finalTopic = customTopic || channel.niche;
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // 🚀 核心升級：將 referenceImages 送給大腦看
        body: JSON.stringify({ stage: 'generate_script', channel, topic: finalTopic, videoType, productDescription, treatment, targetDuration: config.targetDuration, allowNoVoiceover: config.allowNoVoiceover, referenceImages })
      });
      const data = await res.json();
      if (data.success) { setScript(data.script); setLog(`✅ 分鏡腳本生成完畢！腳本已鎖定圖片中的元素。`); } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };

  const handleSceneChange = (id: number, field: 'narration' | 'visual_cue', value: string) => {
    if (!script) return;
    setScript({ ...script, scenes: script.scenes.map(scene => scene.id === id ? { ...scene, [field]: value } : scene) });
    if (field === 'visual_cue') { const newCache = { ...sceneVideoCache }; delete newCache[id]; setSceneVideoCache(newCache); }
  };

  const renderVideo = async () => {
    if (!script) return;
    if (config.videoEngine === 'heygen' && !config.heygenAvatarId) { setLog("⚠️ 請填寫 Avatar ID！"); return; }
    setLoading(true); setLog(`正在準備環境 (模式: ${config.videoEngine})...`);
    const tempChannel = { ...channel, mptConfig: config };

    try {
      if (config.videoEngine === 'heygen' && config.heygenAvatarId) {
          // ... heygen code ...
      } else {
          setLog(`🎥 啟動分散式分鏡渲染架構...`);
          let bakedChunks: string[] = [];

          for (let i = 0; i < script.scenes.length; i++) {
              const scene = script.scenes[i];
              let rawUrl = '';

              if (sceneVideoCache[scene.id]) {
                  setLog(`♻️ 第 ${i+1} 幕影片已在快取中，跳過 Kling 算圖！`);
                  rawUrl = sceneVideoCache[scene.id];
              } else {
                  setLog(`📥 提交第 ${i+1}/${script.scenes.length} 幕算圖請求...`);
                  
                  const imgIndex = i % (referenceImages.length || 1);
                  const currentRefImage = referenceImages.length > 0 ? referenceImages[imgIndex] : undefined;
                  const isFirstSceneWithProduct = !!currentRefImage && scene.id === 1;

                  const submitRes = await fetch('/api/pipeline', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ stage: 'generate_video_submit', visualCue: scene.visual_cue, isFirstSceneWithProduct, useStockFootage: config.useStockFootage, videoEngine: config.videoEngine, klingModelVersion: config.klingModelVersion, referenceImage: currentRefImage })
                  }).then(r => r.json());

                  if (!submitRes.success) throw new Error(`第 ${scene.id} 幕提交失敗: ${submitRes.error}`);

                  if (submitRes.isStock) {
                      setLog(`✅ 第 ${i+1} 幕成功取得圖庫素材！`);
                      rawUrl = submitRes.videoUrl;
                      setSceneVideoCache(prev => ({ ...prev, [scene.id]: rawUrl }));
                  } else {
                      setLog(`⏳ 第 ${i+1} 幕任務已送出！等待 4 分鐘後查詢...`);
                      await new Promise(resolve => setTimeout(resolve, 240000));
                      let attempts = 0;
                      while (true) {
                          const statusRes = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'generate_video_status', videoEngine: config.videoEngine, taskId: submitRes.taskId, operation: submitRes.operation }) }).then(r => r.json());
                          if (statusRes.status === 'completed') { setLog(`✅ 第 ${i+1} 幕算圖完成！`); rawUrl = statusRes.videoUrl; setSceneVideoCache(prev => ({ ...prev, [scene.id]: rawUrl })); break; } 
                          else if (statusRes.status === 'failed' || statusRes.status === 'error') { throw new Error(`第 ${scene.id} 幕失敗: ${statusRes.error}`); }
                          attempts++; setLog(`⏳ 第 ${i+1} 幕持續算圖中... (已輪詢 ${attempts} 次)`);
                          if (attempts > 30) throw new Error(`第 ${scene.id} 幕嚴重超時`);
                          await new Promise(resolve => setTimeout(resolve, 20000)); 
                      }
                  }
              }

              setLog(`🎬 第 ${i+1} 幕取得影片，正在雲端壓製專屬配音與字幕...`);
              const chunkRes = await fetch('/api/pipeline', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage: 'render_scene_chunk', scene, videoUrl: rawUrl, mptConfig: config })
              }).then(r => r.json());

              if (!chunkRes.success) throw new Error(`第 ${scene.id} 幕壓製失敗: ${chunkRes.error}`);
              bakedChunks.push(chunkRes.chunkUrl);
          }

          setLog('🚀 啟動極限光速合併 (使用 0.5s Xfade 柔和轉場)...');
          const stitchRes = await fetch('/api/pipeline', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stage: 'stitch_final', chunkUrls: bakedChunks, mptConfig: config, previousVideoUrl: videoUrl })
          }).then(r => r.json());

          if (!stitchRes.success) throw new Error(`合併失敗: ${stitchRes.error}`);
          setVideoUrl(stitchRes.videoUrl);
          setLog("✅ 終極電影級渲染完成！");
      }
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault(); if (!videoUrl) return;
    setLog("準備下載檔案...");
    try {
        const response = await fetch(videoUrl); const blob = await response.blob(); const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = blobUrl; a.download = `youtube_short_${Date.now()}.mp4`; 
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl); setLog("✅ 下載成功！");
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
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
              <h2 className="text-xl font-semibold mb-6">1. 腳本策略</h2>
              
              <div className="mb-6">
                  <label className="text-xs font-bold text-purple-400 uppercase block mb-3">🎬 影片核心類型</label>
                  <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => handleVideoTypeChange('topic')} className={`py-3 rounded-xl text-xs font-bold transition-all border ${videoType === 'topic' ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>📚 科普</button>
                      <button onClick={() => handleVideoTypeChange('product')} className={`py-3 rounded-xl text-xs font-bold transition-all border ${videoType === 'product' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>📦 產品</button>
                      <button onClick={() => handleVideoTypeChange('avatar')} className={`py-3 rounded-xl text-xs font-bold transition-all border ${videoType === 'avatar' ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>🧑‍💼 數字人</button>
                  </div>
              </div>

              <div className="space-y-3 mb-4">
                <label className="text-xs font-bold text-zinc-400 uppercase">創作主題</label>
                <textarea value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder={`輸入主題...`} className="w-full h-20 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white outline-none resize-none" />
              </div>

              <div className="mb-4">
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-2">影片目標時長</label>
                  <select value={config.targetDuration} onChange={e => setConfig({...config, targetDuration: e.target.value})} className="w-full bg-black border border-zinc-700 p-2 rounded-lg text-sm text-white outline-none">
                      <option value="10">⚡ 10秒 (極短預告/鉤子，限制 1 幕)</option>
                      <option value="15">🚀 15秒 (快節奏精華，限制 2 幕)</option>
                      <option value="20">⏱️ 20秒 (標準快拍，限制 2 幕)</option>
                      <option value="30">⏱️ 30秒 (標準廣告，限制 3 幕)</option>
                      <option value="60">⏳ 60秒 (深度解說，限制 5 幕)</option>
                  </select>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input type="checkbox" checked={config.allowNoVoiceover} onChange={e => setConfig({...config, allowNoVoiceover: e.target.checked})} className="accent-purple-500" />
                      <span className="text-xs text-zinc-400 font-bold">允許純音樂無配音</span>
                  </label>
              </div>

              <div className="mb-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-3">參考圖片庫 (AI 視覺分析)</label>
                  <div className="mb-4">
                      <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-4 rounded-lg text-xs font-bold transition inline-flex items-center gap-2 border border-zinc-700">
                          <span>📷 上傳圖片給 AI 看</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                      <p className="text-[10px] text-zinc-500 mt-2">提示：上傳狗的照片，AI 寫的腳本就絕對不會出現貓。</p>
                  </div>
                  
                  {referenceImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                          {referenceImages.map((img, idx) => (
                              <div key={idx} className="relative flex-shrink-0">
                                  <img src={img} className="w-16 h-16 object-cover rounded-md border border-zinc-600 bg-white" />
                                  <button onClick={() => removeImage(idx)} className="absolute -top-2 -right-2 bg-red-600 w-5 h-5 rounded-full text-[10px] font-bold shadow-lg flex items-center justify-center pb-0.5">✕</button>
                                  <div className="absolute bottom-0 bg-black/70 w-full text-center text-[9px] py-0.5 rounded-b-md">圖 {idx + 1}</div>
                              </div>
                          ))}
                      </div>
                  )}

                  <div className="border-t border-zinc-800/80 pt-3 mt-2">
                      <label className="text-[11px] font-bold text-emerald-400 block mb-1">🛡️ 產品外觀防呆指示</label>
                      <textarea value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="例如：必須用食指扣動板機噴灑" className="w-full bg-black border border-zinc-700 p-2.5 rounded-lg text-xs text-white outline-none resize-none h-16" />
                  </div>
              </div>

              <button onClick={generateTreatment} disabled={loading} className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition disabled:opacity-50 shadow-lg shadow-amber-900/20">
                {loading && !treatment && !script ? "企劃思考中..." : "🧠 1. 生成導演企劃書"}
              </button>
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-xl font-semibold">2. 系統配置</h2>
              
              <div className="flex bg-black rounded-lg p-1 border border-zinc-800">
                  <button onClick={() => setConfig({...config, useStockFootage: true})} className={`flex-1 py-2 text-xs font-bold rounded-md ${config.useStockFootage ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>混合模式</button>
                  <button onClick={() => setConfig({...config, useStockFootage: false})} className={`flex-1 py-2 text-xs font-bold rounded-md ${!config.useStockFootage ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}>純 AI</button>
              </div>

              <div>
                <label className="text-xs text-purple-400 block mb-1 font-bold">影像生成引擎</label>
                <select value={config.videoEngine} onChange={(e) => setConfig({...config, videoEngine: e.target.value as any})} className="w-full bg-black border border-purple-500/30 rounded-lg p-2 text-sm text-white focus:border-purple-500 outline-none">
                  <option value="kling">Kling AI (可靈)</option>
                  <option value="veo">Google Veo 2.0</option>
                  <option value="heygen">HeyGen (數位人)</option>
                </select>
                
                {config.videoEngine === 'kling' && (
                   <div className="animate-fade-in mt-2 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg space-y-4">
                     <div>
                         <label className="text-xs text-emerald-400 block mb-1 font-bold">Kling 模型等級</label>
                         <select value={config.klingModelVersion} onChange={e => setConfig({...config, klingModelVersion: e.target.value})} className="w-full bg-black border border-emerald-500/50 p-2 rounded-lg text-sm text-white outline-none">
                             <option value="kling-3.0">Kling 3.0 (最高精準)</option>
                             <option value="kling-2.6-pro">Kling 2.6 Pro</option>
                             <option value="kling-2.5-turbo">Kling 2.5 Turbo</option>
                         </select>
                     </div>
                   </div>
                )}
              </div>

              <div className="border-t border-zinc-800 my-4 pt-4"></div>

              <div>
                  <label className="text-xs text-zinc-400 block mb-1 font-bold">配音引擎</label>
                  <div className="flex bg-black rounded-lg p-1 border border-zinc-800 mb-2">
                     <button onClick={() => setConfig({...config, ttsEngine: 'edge', voiceId: 'zh-CN-YunxiNeural'})} className={`flex-1 py-2 text-xs font-bold rounded-md ${config.ttsEngine === 'edge' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Edge</button>
                     <button onClick={() => setConfig({...config, ttsEngine: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJcg'})} className={`flex-1 py-2 text-xs font-bold rounded-md ${config.ttsEngine === 'elevenlabs' ? 'bg-purple-900/50 text-purple-400' : 'text-zinc-500'}`}>ElevenLabs</button>
                  </div>
                  {config.ttsEngine === 'elevenlabs' ? (
                      <input type="text" value={config.voiceId} onChange={e => setConfig({...config, voiceId: e.target.value})} placeholder="輸入 20 碼亂碼 ID" className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none" />
                  ) : (
                      <select value={config.voiceId} onChange={e => setConfig({...config, voiceId: e.target.value})} className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none">
                          <option value="zh-CN-YunxiNeural">雲希 (中國男聲🔥)</option>
                          <option value="zh-CN-XiaoxiaoNeural">曉曉 (中國女聲🔥)</option>
                          <option value="zh-TW-HsiaoChenNeural">曉辰 (台灣女聲)</option>
                          <option value="zh-TW-YunJheNeural">允哲 (台灣男聲)</option>
                          <option value="en-US-JennyNeural">Jenny (標準英文女聲)</option>
                      </select>
                  )}
              </div>

              <div className="border-t border-zinc-800 my-4 pt-4"></div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-bold">配樂風格 (BGM)</label>
                <select value={config.bgmMood} onChange={(e) => setConfig({...config, bgmMood: e.target.value as any})} className="w-full bg-black border border-zinc-800 p-2 rounded-lg text-sm text-white outline-none">
                  <option value="emotional">emotional</option>
                  <option value="Epic">Epic</option>
                  <option value="Relaxing">Relaxing</option>
                  <option value="funny">funny</option>
                  <option value="energetic">energetic</option>
                  <option value="none">🔇 無配樂 (No BGM)</option>
                </select>
              </div>
              
              <button onClick={testSettings} disabled={loading} className="w-full mt-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-blue-400 border border-blue-900/50 rounded-xl font-bold transition flex items-center justify-center gap-2">
                  🛠️ 執行環境與 API 檢測
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            {treatment && !script && (
              <div className="bg-zinc-900/80 p-6 rounded-2xl border border-amber-500/50 h-full flex flex-col shadow-[0_0_20px_rgba(245,158,11,0.1)] animate-fade-in">
                <h2 className="text-xl font-black mb-4 text-amber-400 flex items-center gap-2">📝 導演企劃審閱</h2>
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div><label className="text-[10px] font-bold text-amber-500 uppercase block mb-1">核心切角</label><textarea value={treatment.coreAngle} onChange={e => setTreatment({...treatment, coreAngle: e.target.value})} className="w-full bg-black/50 border border-amber-900/50 p-3 rounded-lg text-sm text-amber-100 outline-none focus:border-amber-500 resize-none h-20" /></div>
                    <div><label className="text-[10px] font-bold text-pink-400 uppercase block mb-1">目標受眾情緒</label><input value={treatment.targetEmotion} onChange={e => setTreatment({...treatment, targetEmotion: e.target.value})} className="w-full bg-black/50 border border-pink-900/50 p-3 rounded-lg text-sm text-pink-100 outline-none focus:border-pink-500" /></div>
                    <div><label className="text-[10px] font-bold text-blue-400 uppercase block mb-1">視覺風格</label><textarea value={treatment.visualStyle} onChange={e => setTreatment({...treatment, visualStyle: e.target.value})} className="w-full bg-black/50 border border-emerald-900/50 p-3 rounded-lg text-sm text-emerald-100 outline-none focus:border-emerald-500 resize-none h-16" /></div>
                </div>
                <div className="pt-6 mt-4 border-t border-amber-900/30">
                    <button onClick={generateFinalScript} disabled={loading} className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-black shadow-lg shadow-orange-900/20 transition-all">
                        {loading ? "撰寫分鏡中..." : "✅ 2. 確認企劃並生成分鏡腳本"}
                    </button>
                </div>
              </div>
            )}

            {script && (
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-full flex flex-col animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">3. 分鏡腳本</h2>
                    <button onClick={() => setScript(null)} className="text-[10px] text-zinc-500 hover:text-amber-400 underline">← 退回修改企劃</button>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                  {script.scenes.map((scene, idx) => (
                    <div key={scene.id} className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-3 relative overflow-hidden">
                      {sceneVideoCache[scene.id] && <div className="absolute top-0 right-0 bg-emerald-600/80 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">已快取 ✅</div>}
                      <div className="text-xs font-mono text-zinc-500 flex justify-between">
                          <span>場景 {scene.id}</span>
                          {referenceImages.length > 0 && <span className="text-blue-400">使用 圖 { (idx % referenceImages.length) + 1 }</span>}
                      </div>
                      <div><label className="text-[10px] text-zinc-500 font-bold mb-1 block">配音台詞</label><textarea value={scene.narration} onChange={(e) => handleSceneChange(scene.id, 'narration', e.target.value)} className="w-full bg-zinc-900/50 border border-zinc-700/50 p-2 rounded-lg text-sm text-zinc-300 outline-none focus:border-indigo-500 resize-none" rows={2} /></div>
                      <div><label className="text-[10px] text-emerald-600 font-bold mb-1 flex items-center gap-1">👁️ 畫面提示詞</label><textarea value={scene.visual_cue} onChange={(e) => handleSceneChange(scene.id, 'visual_cue', e.target.value)} className="w-full bg-emerald-950/20 border border-emerald-900/30 p-2 rounded-lg text-xs text-emerald-400 outline-none focus:border-emerald-500 resize-none" rows={3} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!treatment && !script && (
                <div className="bg-zinc-900/20 border border-zinc-800 border-dashed rounded-2xl h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center min-h-[400px]">
                    <div className="text-4xl mb-4 opacity-50">🤖</div>
                    <p className="font-bold text-sm">等待導演指令</p>
                </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 min-h-[400px] flex flex-col items-center justify-center relative">
              {videoUrl ? (
                <div className="w-full space-y-4">
                  <div className="w-full aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                    <video src={videoUrl} controls className="w-full h-full object-contain" autoPlay loop />
                  </div>
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
                    {loading && !videoUrl ? "電影級渲染中..." : "🎬 4. 開始電影級渲染"}
                </button>
            </div>

            <div className="bg-black font-mono text-xs text-zinc-400 p-4 rounded-xl border border-zinc-800 h-48 overflow-y-auto">
              <div className="text-zinc-500 mb-2">系統日誌:</div>
              {log && <div className="text-emerald-400 whitespace-pre-wrap">&gt; {log}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
