import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScriptData } from '../types';

interface MPTStudioProps { channel: ChannelConfig; onBack: () => void; isEmbedded?: boolean; }

export const MPTStudio: React.FC<MPTStudioProps> = ({ channel, onBack, isEmbedded = false }) => {
  const [script, setScript] = useState<ScriptData | null>(null);
  const [treatment, setTreatment] = useState<any>(null); // 🚀 企劃書狀態
  
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState<string>("");
  
  const [videoType, setVideoType] = useState<'avatar' | 'product' | 'topic'>(channel.defaultVideoType || 'topic');

  const [config, setConfig] = useState({
    bgmVolume: 0.1, fontSize: 80, subtitleColor: '#FFFF00', ttsEngine: 'edge' as 'edge' | 'elevenlabs', voiceId: 'zh-TW-HsiaoChenNeural', 
    videoEngine: channel.defaultVideoType === 'product' ? 'kling' : (channel.defaultVideoType === 'avatar' ? 'heygen' : 'veo'),
    heygenAvatarId: channel.mptConfig?.heygenAvatarId || '', avatarScale: 1.0, klingModelVersion: channel.defaultKlingModel || 'kling-3.0',
    targetDuration: '60', useStockFootage: channel.defaultVideoType === 'topic', fontName: 'NotoSansTC-Bold.ttf', bgmMood: 'random' as 'random' | 'epic' | 'relaxing' | 'funny' | 'suspense' | 'none'
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
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const handleVideoTypeChange = (type: 'avatar' | 'product' | 'topic') => {
      setVideoType(type);
      if (type === 'avatar') setConfig({...config, videoEngine: 'heygen', useStockFootage: false});
      if (type === 'product') setConfig({...config, videoEngine: 'kling', useStockFootage: false});
      if (type === 'topic') setConfig({...config, videoEngine: 'veo', useStockFootage: true});
      setScript(null); setTreatment(null); // 切換時清空
  };

  const fetchAiSuggestions = async () => {
    setIsSuggesting(true);
    try {
        const res = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'suggest_topics', channel }) });
        const data = await res.json();
        if (data.success) { setAiSuggestions(data.topics); setTopicMode('ai'); } 
    } catch(e: any) {} finally { setIsSuggesting(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setReferenceImage(reader.result as string); setLog("✅ 圖片已載入。如果是產品，請記得填寫防呆描述！"); };
      reader.readAsDataURL(file);
    }
  };

  // 🚀 階段 1：呼叫大腦生成企劃書
  const generateTreatment = async () => {
    if (!customTopic && topicMode === 'custom') { setLog("請輸入主題！"); return; }
    const finalTopic = customTopic || channel.niche;
    setLoading(true); setLog(`🧠 正在呼叫 Agent 導演規劃企劃大綱...`);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'generate_treatment', channel, topic: finalTopic, videoType, productDescription })
      });
      const data = await res.json();
      if (data.success) { setTreatment(data.treatment); setLog(`✅ 企劃書已產出！請在右側審閱並修改。`); } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };

  // 🚀 階段 2：依據企劃書生成最終腳本
  const generateFinalScript = async () => {
    setLoading(true); setLog(`🎬 導演已確認企劃，正在撰寫分鏡腳本...`);
    try {
      const finalTopic = customTopic || channel.niche;
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'generate_script', channel, topic: finalTopic, videoType, productDescription, referenceImage, treatment })
      });
      const data = await res.json();
      if (data.success) { setScript(data.script); setLog(`✅ 分鏡腳本生成完畢！`); } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };

  const handleSceneChange = (id: number, field: 'narration' | 'visual_cue', value: string) => {
    if (!script) return;
    setScript({ ...script, scenes: script.scenes.map(scene => scene.id === id ? { ...scene, [field]: value } : scene) });
  };

  const uploadToPlatform = async (platform: string, videoDataUri: string, metadata: any) => {
      setLog(`正在上傳至 ${platform}...`);
      try {
          const res = await fetch('/api/upload_video', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoUrl: videoDataUri, auth: channel.auth, metadata: { title: metadata.title, desc: metadata.description }, platform })
          });
          const data = await res.json();
          if (data.success) setLog(`✅ 已上傳至 ${platform}: ${data.url || data.videoId}`); else setLog(`❌ 上傳失敗: ${data.error}`);
      } catch (e: any) { setLog(`❌ 上傳錯誤: ${e.message}`); }
  };

  const renderVideo = async () => {
    if (!script) return;
    if (config.videoEngine === 'heygen' && !config.heygenAvatarId) { setLog("⚠️ 請填寫 Avatar ID！"); return; }
    setLoading(true); setLog(`正在準備環境 (模式: ${config.videoEngine})...`);
    const tempChannel = { ...channel, mptConfig: config };

    try {
      let finalHeygenUrl = undefined;
      let preGeneratedSceneUrls: Record<number, string> = {};

      if (config.videoEngine === 'heygen' && config.heygenAvatarId) {
          setLog('正在提交 HeyGen 渲染任務...'); 
          const submitRes = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'heygen_submit', channel: tempChannel, scriptData: script }) }).then(r => r.json());
          if (!submitRes.success) throw new Error(submitRes.error || "提交失敗");
          setLog('HeyGen 雲端算圖中 (預計 3~5 分鐘)...');
          await new Promise(resolve => setTimeout(resolve, 180000)); 
          while (true) {
              const statusRes = await fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'heygen_status', videoId: submitRes.videoId }) }).then(r => r.json());
              if (statusRes.status === 'completed') { finalHeygenUrl = statusRes.videoUrl; break; } 
              else if (statusRes.status === 'failed' || statusRes.status === 'error') { throw new Error("渲染失敗。"); }
              await new Promise(resolve => setTimeout(resolve, 10000));
          }
      } else {
          setLog(`🎥 啟動逐幕分散運算...`);
          for (let i = 0; i < script.scenes.length; i++) {
              const scene = script.scenes[i];
              setLog(`⏳ 運算第 ${i+1}/${script.scenes.length} 幕畫面...`);
              const isFirstSceneWithProduct = !!referenceImage && scene.id === 1;
              const sceneRes = await fetch('/api/pipeline', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage: 'generate_single_video', visualCue: scene.visual_cue, isFirstSceneWithProduct, useStockFootage: config.useStockFootage, videoEngine: config.videoEngine, klingModelVersion: config.klingModelVersion, referenceImage: referenceImage || script.referenceImage })
              }).then(r => r.json());
              if (sceneRes.success) { preGeneratedSceneUrls[scene.id] = sceneRes.videoUrl; } else { throw new Error(`場景 ${scene.id} 生成失敗: ${sceneRes.error}`); }
              if (i < script.scenes.length - 1 && config.videoEngine === 'veo') await new Promise(resolve => setTimeout(resolve, 30000));
          }
      }

      setLog('正在合成最終影片與字幕...');
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_mpt', channel: tempChannel, scriptData: { ...script, referenceImage: referenceImage || script.referenceImage }, previousVideoUrl: videoUrl, preGeneratedHeygenUrl: finalHeygenUrl, preGeneratedSceneUrls, videoType })
      });
      const data = await res.json();
      if (data.success) { setVideoUrl(data.videoUrl); setLog("渲染完成！"); } else setLog("錯誤: " + data.error);
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };

  const publishVideo = async () => {
      if (!videoUrl || !script) return;
      if (uploadTargets.length === 0) { setLog("請至少選擇一個上傳目標！"); return; }
      setLoading(true); setLog("準備發布...");
      try {
        const blob = await fetch(videoUrl).then(r => r.blob());
        const reader = new FileReader(); reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            for (const target of uploadTargets) await uploadToPlatform(target, base64data, script.socialMediaCopy || { title: script.title, description: script.title });
            setLog("所有發布任務已完成！"); setLoading(false);
        };
      } catch (e: any) { setLog("發布錯誤: " + e.message); setLoading(false); }
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
          {/* 左側：大腦設定 */}
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
                <textarea value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder={`輸入主題... (預設: ${channel.niche})`} className="w-full h-20 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white outline-none resize-none" />
              </div>

              <div className="mb-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                  <label className="text-xs font-bold text-zinc-400 uppercase block mb-3">參考圖片 (Image-to-Video)</label>
                  <div className="flex items-start gap-4 mb-4">
                      <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-4 rounded-lg text-xs font-bold transition flex items-center gap-2 border border-zinc-700 h-fit">
                          <span>📷 上傳照片</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                      {referenceImage && <img src={referenceImage} className="w-16 h-16 object-cover rounded-md border border-zinc-600" />}
                  </div>
                  <div className="border-t border-zinc-800/80 pt-3 mt-2">
                      <label className="text-[11px] font-bold text-emerald-400 block mb-1">🛡️ 產品外觀防呆指示</label>
                      <textarea value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="例如：必須用食指扣動板機噴灑" className="w-full bg-black border border-zinc-700 p-2.5 rounded-lg text-xs text-white outline-none resize-none h-16" />
                  </div>
              </div>

              <button onClick={generateTreatment} disabled={loading} className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition disabled:opacity-50 shadow-lg shadow-amber-900/20">
                {loading && !treatment && !script ? "企劃思考中..." : "🧠 1. 生成導演企劃書"}
              </button>
            </div>

            {/* 架構設定 (縮減版) */}
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-xl font-semibold">2. 系統配置</h2>
              <div>
                <label className="text-xs text-purple-400 block mb-1 font-bold">影像引擎</label>
                <select value={config.videoEngine} onChange={(e) => setConfig({...config, videoEngine: e.target.value as any})} className="w-full bg-black border border-zinc-700 rounded-lg p-2 text-sm text-white outline-none">
                  <option value="kling">Kling AI</option>
                  <option value="veo">Google Veo 2.0</option>
                  <option value="heygen">HeyGen</option>
                </select>
              </div>
              <div>
                  <label className="text-xs text-zinc-400 block mb-1 font-bold">配音引擎</label>
                  <select value={config.ttsEngine} onChange={e => setConfig({...config, ttsEngine: e.target.value as any})} className="w-full bg-black border border-zinc-700 rounded-lg p-2 text-sm text-white outline-none">
                      <option value="edge">Edge TTS</option>
                      <option value="elevenlabs">ElevenLabs</option>
                  </select>
              </div>
            </div>
          </div>

          {/* 中間：內容審閱 */}
          <div className="lg:col-span-4 space-y-6">
            {/* 企劃書區塊 */}
            {treatment && !script && (
              <div className="bg-zinc-900/80 p-6 rounded-2xl border border-amber-500/50 h-full flex flex-col shadow-[0_0_20px_rgba(245,158,11,0.1)] animate-fade-in">
                <h2 className="text-xl font-black mb-4 text-amber-400 flex items-center gap-2">📝 導演企劃審閱</h2>
                <p className="text-xs text-zinc-400 mb-6">Agent 已為您擬定核心策略。您可以直接修改，滿意後再生成分鏡腳本。</p>
                
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div><label className="text-[10px] font-bold text-amber-500 uppercase block mb-1">核心切角</label><textarea value={treatment.coreAngle} onChange={e => setTreatment({...treatment, coreAngle: e.target.value})} className="w-full bg-black/50 border border-amber-900/50 p-3 rounded-lg text-sm text-amber-100 outline-none focus:border-amber-500 resize-none h-20" /></div>
                    <div><label className="text-[10px] font-bold text-pink-400 uppercase block mb-1">目標受眾情緒</label><input value={treatment.targetEmotion} onChange={e => setTreatment({...treatment, targetEmotion: e.target.value})} className="w-full bg-black/50 border border-pink-900/50 p-3 rounded-lg text-sm text-pink-100 outline-none focus:border-pink-500" /></div>
                    <div><label className="text-[10px] font-bold text-blue-400 uppercase block mb-1">前3秒鉤子</label><textarea value={treatment.hookStrategy} onChange={e => setTreatment({...treatment, hookStrategy: e.target.value})} className="w-full bg-black/50 border border-blue-900/50 p-3 rounded-lg text-sm text-blue-100 outline-none focus:border-blue-500 resize-none h-20" /></div>
                    <div><label className="text-[10px] font-bold text-emerald-400 uppercase block mb-1">視覺風格</label><textarea value={treatment.visualStyle} onChange={e => setTreatment({...treatment, visualStyle: e.target.value})} className="w-full bg-black/50 border border-emerald-900/50 p-3 rounded-lg text-sm text-emerald-100 outline-none focus:border-emerald-500 resize-none h-16" /></div>
                </div>

                <div className="pt-6 mt-4 border-t border-amber-900/30">
                    <button onClick={generateFinalScript} disabled={loading} className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-black shadow-lg shadow-orange-900/20 transition-all">
                        {loading ? "撰寫分鏡中..." : "✅ 2. 確認企劃並生成分鏡腳本"}
                    </button>
                </div>
              </div>
            )}

            {/* 腳本區塊 */}
            {script && (
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 h-full flex flex-col animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">3. 分鏡腳本</h2>
                    <button onClick={() => setScript(null)} className="text-[10px] text-zinc-500 hover:text-amber-400 underline">← 退回修改企劃</button>
                </div>
                
                <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                  {script.scenes.map((scene) => (
                    <div key={scene.id} className="p-4 bg-black/40 rounded-xl border border-zinc-800 space-y-3">
                      <div className="text-xs font-mono text-zinc-500">場景 {scene.id}</div>
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
                    <p className="text-xs mt-2">請先在左側點擊「生成導演企劃書」</p>
                </div>
            )}
          </div>

          {/* 右側：預覽與發布 */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 min-h-[400px] flex flex-col items-center justify-center relative">
              {videoUrl ? (
                <div className="w-full space-y-4">
                  <div className="w-full aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                    <video src={videoUrl} controls className="w-full h-full object-contain" autoPlay loop />
                  </div>
                </div>
              ) : (
                <div className="text-center text-zinc-500"><div className="text-4xl mb-4">🎬</div><p>預覽將顯示於此</p></div>
              )}
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                <button onClick={renderVideo} disabled={loading || !script} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black uppercase tracking-widest disabled:opacity-50 mb-4">
                    {loading && !videoUrl ? "渲染中..." : "🎬 4. 開始終極渲染"}
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
