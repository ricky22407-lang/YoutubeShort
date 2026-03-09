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
    setLog("正在分析趨勢並生成靈感...");
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
            setLog("✅ 靈感生成完畢！");
        } else {
            setLog("❌ 建議失敗: " + data.error);
        }
    } catch(e: any) {
        setLog("❌ 建議錯誤: " + e.message);
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
        setLog("✅ 圖片已成功載入！");
      };
      reader.readAsDataURL(file);
    }
  };

  const generateScript = async () => {
    if (!customTopic && topicMode === 'custom') { setLog("⚠️ 請先輸入創作主題！"); return; }
    const finalTopic = customTopic || channel.niche;
    setLoading(true);
    setLog(`🧠 正在深度運算腳本 (目標: ${config.targetDuration} 秒內)...`);
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
        setLog(`✅ 腳本生成完美落地！共策劃了 ${data.script.scenes.length} 個分鏡。`);
      } else setLog("❌ 錯誤: " + data.error);
    } catch (e: any) { setLog("❌ 錯誤: " + e.message); } 
    finally { setLoading(false); }
  };

  const uploadToPlatform = async (platform: string, videoDataUri: string, metadata: any) => {
      setLog(`🚀 正在連線至 ${platform} 發布...`);
      try {
          const res = await fetch('/api/upload_video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoUrl: videoDataUri,
                  auth: channel.auth, 
                  metadata: { title: metadata.title, desc: metadata.description },
                  platform
              })
          });
          const data = await res.json();
          if (data.success) setLog(`✅ 成功發布至 ${platform}!`);
          else setLog(`❌ 發布失敗 (${platform}): ${data.error}`);
      } catch (e: any) { setLog(`❌ 發布錯誤 (${platform}): ${e.message}`); }
  };

  const renderVideo = async () => {
    if (!script) return;
    if (config.videoEngine === 'heygen' && !config.heygenAvatarId) { setLog("⚠️ 請填寫 HeyGen Avatar ID！"); return; }

    setLoading(true);
    setLog(`🎬 啟動渲染引擎 (核心: ${config.videoEngine.toUpperCase()})...`);
    const tempChannel = { ...channel, mptConfig: config, uploadTargets: [] };

    try {
      let finalHeygenUrl = undefined;
      if (config.videoEngine === 'heygen' && config.heygenAvatarId) {
          setLog('📦 正在向 HeyGen 雲端派發任務...'); 
          const submitRes = await fetch('/api/pipeline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stage: 'heygen_submit', channel: tempChannel, scriptData: script })
          }).then(r => r.json());
          
          if (!submitRes.success) throw new Error(submitRes.error || "提交任務失敗");
          
          setLog('☁️ HeyGen 雲端算圖中 (為節省資源，系統進入 3 分鐘深眠等待)...');
          await new Promise(resolve => setTimeout(resolve, 180000)); 
          
          setLog('🔍 正在掃描 HeyGen 渲染進度...');
          while (true) {
              const statusRes = await fetch('/api/pipeline', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage: 'heygen_status', videoId: submitRes.videoId })
              }).then(r => r.json());
              
              if (statusRes.status === 'completed') { finalHeygenUrl = statusRes.videoUrl; break; } 
              else if (statusRes.status === 'failed' || statusRes.status === 'error') { throw new Error("HeyGen 渲染被拒絕或失敗。"); }
              await new Promise(resolve => setTimeout(resolve, 10000));
          }
      }

      setLog('✨ 正在進行最終影像、音樂與字幕合成...');
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            stage: 'render_mpt', 
            channel: tempChannel, 
            scriptData: { ...script, referenceImage: referenceImage || script.referenceImage },
            previousVideoUrl: videoUrl,
            preGeneratedHeygenUrl: finalHeygenUrl 
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setVideoUrl(data.videoUrl);
        setLog("🎉 渲染大功告成！請在右側預覽您的作品。");
      } else setLog("❌ 合成錯誤: " + data.error);
    } catch (e: any) { setLog("❌ 系統錯誤: " + e.message); } 
    finally { setLoading(false); }
  };

  const publishVideo = async () => {
      if (!videoUrl || !script) return;
      if (uploadTargets.length === 0) { setLog("⚠️ 請勾選至少一個發布平台！"); return; }
      
      setLoading(true);
      setLog("📦 正在封裝影片準備發布...");
      try {
        const blob = await fetch(videoUrl).then(r => r.blob());
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            for (const target of uploadTargets) {
                await uploadToPlatform(target, base64data, script.socialMediaCopy || { title: script.title, description: script.title });
            }
            setLog("🎉 所有發布排程已全數完成！");
            setLoading(false);
        };
      } catch (e: any) {
          setLog("❌ 封裝錯誤: " + e.message);
          setLoading(false);
      }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!videoUrl) return;
    setLog("⬇️ 正在為您準備高畫質下載檔...");
    try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `YouTube_Shorts_${Date.now()}.mp4`; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
        setLog("✅ 下載成功，請查看您的資料夾！");
    } catch (error: any) { setLog("❌ 下載失敗: " + error.message); }
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen bg-slate-50 p-6 md:p-10'} text-slate-800 font-sans selection:bg-indigo-100`}>
      <div className={`${isEmbedded ? '' : 'max-w-7xl mx-auto'} space-y-8`}>
        
        {/* Header */}
        {!isEmbedded && (
          <div className="flex items-center justify-between bg-white px-8 py-5 rounded-3xl shadow-sm border border-slate-100">
            <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-semibold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              返回控制台
            </button>
            <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent drop-shadow-sm">
              MPT 創作室 <span className="text-slate-300 mx-2">|</span> {channel.name}
            </h1>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ================= 左側：大腦與設定 ================= */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. 大腦 (腳本) */}
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 transition-all hover:shadow-2xl hover:shadow-slate-200/50">
              <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">🧠 第一步：注入大腦</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">創作主題與靈感</label>
                  <div className="flex bg-slate-100/80 p-1.5 rounded-xl mb-3">
                      <button onClick={() => setTopicMode('custom')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${topicMode === 'custom' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>✍️ 自訂主題</button>
                      <button onClick={() => { setTopicMode('ai'); if(aiSuggestions.length === 0) fetchAiSuggestions(); }} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${topicMode === 'ai' ? 'bg-white text-violet-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>✨ AI 趨勢靈感</button>
                  </div>
                  
                  {topicMode === 'custom' && (
                      <textarea value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder={`請輸入您的核心概念...\n(預設: ${channel.niche})`} className="w-full h-28 bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none transition-all" />
                  )}
                  {topicMode === 'ai' && (
                      <div className="space-y-2">
                          {isSuggesting ? (
                              <div className="flex flex-col items-center justify-center py-8 text-violet-500 space-y-3">
                                  <span className="animate-spin text-2xl">🪄</span>
                                  <span className="text-xs font-bold animate-pulse">大腦深度挖掘中...</span>
                              </div>
                          ) : (
                              <div className="space-y-2 max-h-52 overflow-y-auto pr-2 custom-scrollbar">
                                  {aiSuggestions.map((topic, idx) => (
                                      <button key={idx} onClick={() => setCustomTopic(topic)} className={`w-full text-left p-3.5 rounded-xl text-sm transition-all border ${customTopic === topic ? 'bg-violet-50 border-violet-300 text-violet-700 font-bold shadow-sm' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>{topic}</button>
                                  ))}
                                  <button onClick={fetchAiSuggestions} className="w-full py-3 mt-2 text-xs font-bold text-slate-400 hover:text-indigo-600 border border-dashed border-slate-300 hover:border-indigo-300 rounded-xl transition-colors">🔄 重新獲取靈感</button>
                              </div>
                          )}
                      </div>
                  )}
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">目標時長控制</label>
                    <select value={config.targetDuration} onChange={e => setConfig({...config, targetDuration: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl p-3 text-sm font-semibold transition-all outline-none cursor-pointer">
                        <option value="30">⏱️ 30 秒以內 (快節奏 / 爆發力)</option>
                        <option value="60">⏳ 60 秒以內 (標準劇情 / 完整敘事)</option>
                    </select>
                </div>

                {/* 圖片上傳區 */}
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">參考素材 (圖生文)</label>
                    <div className="flex items-center gap-4">
                        <label className="cursor-pointer bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-600 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-slate-200 shadow-sm">
                            <span className="text-lg">📸</span> <span>上傳圖片</span>
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                        {referenceImage ? (
                            <div className="relative group w-14 h-14 shrink-0 shadow-sm">
                                <img src={referenceImage} alt="Preview" className="w-full h-full object-cover rounded-xl border border-slate-200" />
                                <button onClick={() => setReferenceImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow-md hover:scale-110">×</button>
                            </div>
                        ) : (
                            <span className="text-[10px] text-slate-400 font-medium leading-tight">讓 AI 根據產品或場景<br/>精準撰寫腳本</span>
                        )}
                    </div>
                </div>
              </div>

              <button onClick={generateScript} disabled={loading || (topicMode === 'custom' && !customTopic && !channel.niche)} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0">
                {loading ? "✨ 腦力激盪中..." : "⚡ 立即生成腳本"}
              </button>
            </div>

            {/* 2. 架構 (配置) */}
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 transition-all hover:shadow-2xl hover:shadow-slate-200/50 space-y-5">
              <h2 className="text-xl font-extrabold text-slate-800 mb-2 flex items-center gap-2">⚙️ 第二步：視覺與聲線</h2>
              
              <div className="flex bg-slate-100/80 p-1.5 rounded-xl">
                  <button onClick={() => setConfig({...config, useStockFootage: true})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${config.useStockFootage ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>🌍 素材混合模式</button>
                  <button onClick={() => setConfig({...config, useStockFootage: false})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!config.useStockFootage ? 'bg-white text-violet-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>🤖 純 AI 生成</button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">算圖引擎</label>
                <select value={config.videoEngine} onChange={(e) => setConfig({...config, videoEngine: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl p-3 text-sm font-semibold transition-all outline-none cursor-pointer">
                  <option value="veo">Google Veo 3.1 (電影級)</option>
                  <option value="sora">OpenAI Sora 2.0 (寫實級)</option>
                  <option value="jimeng">Jimeng (動漫/風格化)</option>
                  <option value="heygen">HeyGen (真人數位人克隆)</option>
                </select>
                
                {/* HeyGen 專屬配置 */}
                {config.videoEngine === 'heygen' && (
                   <div className="mt-3 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                     <div>
                         <label className="text-xs font-bold text-indigo-700 block mb-1.5">HeyGen Avatar / Group ID</label>
                         <input type="text" value={config.heygenAvatarId} onChange={e => setConfig({...config, heygenAvatarId: e.target.value})} placeholder="請輸入 ID (多組請用逗號分隔)" className="w-full bg-white border border-indigo-200 p-2.5 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" />
                         <p className="text-[10px] text-indigo-500/80 mt-1.5 font-medium">✨ 支援智慧群組盲抽：輸入 Group ID 系統將自動抓取所有衣櫃隨機換裝。</p>
                     </div>
                     <div>
                         <label className="text-xs font-bold text-indigo-700 block mb-2">畫面縮放防白邊 ({config.avatarScale.toFixed(1)}x)</label>
                         <input type="range" min="1" max="2.5" step="0.1" value={config.avatarScale} onChange={e => setConfig({...config, avatarScale: parseFloat(e.target.value)})} className="w-full accent-indigo-600" />
                     </div>
                   </div>
                )}
              </div>

              <div className="border-t border-slate-100 my-2"></div>

              <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">配音聲線</label>
                  <div className="flex bg-slate-100/80 p-1.5 rounded-xl mb-3">
                     <button onClick={() => setConfig({...config, ttsEngine: 'edge', voiceId: 'zh-TW-HsiaoChenNeural'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${config.ttsEngine === 'edge' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>Edge</button>
                     <button onClick={() => setConfig({...config, ttsEngine: 'elevenlabs', voiceId: 'Puck'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${config.ttsEngine === 'elevenlabs' ? 'bg-white text-violet-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>ElevenLabs</button>
                  </div>
                  {config.ttsEngine === 'elevenlabs' ? (
                      <input type="text" value={config.voiceId} onChange={e => setConfig({...config, voiceId: e.target.value})} placeholder="輸入 Voice ID..." className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  ) : (
                      <select value={config.voiceId} onChange={e => setConfig({...config, voiceId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl p-3 text-sm font-semibold transition-all outline-none cursor-pointer">
                          <option value="zh-TW-HsiaoChenNeural">曉辰 (溫柔女聲)</option>
                          <option value="zh-TW-YunJheNeural">允哲 (清晰男聲)</option>
                          <option value="zh-TW-HsiaoYuNeural">曉雨 (活潑女聲)</option>
                      </select>
                  )}
              </div>

              <div className="border-t border-slate-100 my-2"></div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">配樂音量</label>
                    <input type="range" min="0" max="1" step="0.1" value={config.bgmVolume} onChange={(e) => setConfig({...config, bgmVolume: parseFloat(e.target.value)})} className="w-full accent-indigo-600 mt-2" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">字幕字號</label>
                    <input type="range" min="40" max="120" step="2" value={config.fontSize} onChange={(e) => setConfig({...config, fontSize: parseInt(e.target.value)})} className="w-full accent-indigo-600 mt-2" />
                  </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">字幕顏色</label>
                    <div className="flex gap-2">
                        {['#FFFF00', '#FFFFFF', '#00FFFF', '#FF00FF', '#00FF00'].map(color => (
                            <button key={color} onClick={() => setConfig({...config, subtitleColor: color})} className={`w-7 h-7 rounded-full border-2 shadow-sm transition-transform hover:scale-110 ${config.subtitleColor === color ? 'border-indigo-500 scale-110 ring-2 ring-indigo-100' : 'border-slate-200'}`} style={{ backgroundColor: color }} />
                        ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">字幕字型</label>
                    <select value={config.fontName} onChange={(e) => setConfig({...config, fontName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs text-slate-700 font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer">
                      <option value="NotoSansTC-Bold.ttf">思源黑體 (標準)</option>
                      <option value="NotoSerifTC-Bold.ttf">思源宋體 (文青)</option>
                      <option value="ZCOOLKuaiLe-Regular.ttf">快樂體 (活潑)</option>
                    </select>
                  </div>
              </div>
            </div>
          </div>

          {/* ================= 中間：內容預覽 ================= */}
          <div className="lg:col-span-4">
             {script ? (
              <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 h-full flex flex-col transition-all">
                <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">📝 第三步：腳本審閱</h2>
                
                {script.socialMediaCopy && (
                    <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 mb-5 space-y-3 shadow-sm">
                        <div className="text-xs font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>社群發布元數據</div>
                        <div>
                            <div className="text-[10px] font-bold text-indigo-400 mb-0.5">影片標題</div>
                            <div className="text-sm font-bold text-slate-800 leading-snug">{script.socialMediaCopy.title}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-indigo-400 mb-0.5">內容描述</div>
                            <div className="text-xs text-slate-600 leading-relaxed">{script.socialMediaCopy.description}</div>
                        </div>
                    </div>
                )}

                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {script.scenes.map((scene) => (
                    <div key={scene.id} className="p-5 bg-slate-50 hover:bg-white transition-colors rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-black text-slate-400 group-hover:text-indigo-400 transition-colors uppercase tracking-widest">Scene {scene.id}</div>
                      </div>
                      <p className="text-sm text-slate-700 font-medium leading-relaxed mb-4">"{scene.narration}"</p>
                      <div className="text-[11px] text-emerald-700 bg-emerald-100/70 px-3 py-1.5 rounded-lg w-fit flex items-center gap-1.5 font-semibold">
                          <span className="text-sm">🎥</span> {scene.visual_cue}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
                <div className="bg-white/50 border border-slate-200 border-dashed rounded-[2rem] h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center min-h-[400px]">
                    <div className="text-5xl mb-4 opacity-50 grayscale">📝</div>
                    <p className="font-bold">尚未生成腳本</p>
                    <p className="text-xs mt-2">請先在左側完成第一步操作</p>
                </div>
            )}
          </div>

          {/* ================= 右側：渲染與發布 ================= */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 min-h-[420px] flex flex-col items-center justify-center relative transition-all">
              {videoUrl ? (
                <div className="w-full space-y-5 animate-fade-in">
                  <div className="w-full aspect-[9/16] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl shadow-indigo-900/20 relative border-[6px] border-slate-50">
                    <video src={videoUrl} controls className="w-full h-full object-contain" autoPlay loop />
                  </div>
                  <button onClick={handleDownload} className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-300 hover:shadow-xl hover:-translate-y-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    下載高畫質影片檔案
                  </button>
                </div>
              ) : (
                <div className="text-center text-slate-400">
                    <div className="text-6xl mb-5 opacity-40">📱</div>
                    <p className="font-bold text-slate-500">預覽畫面將顯示於此</p>
                    <p className="text-xs mt-2">當影片渲染完成後即可播放</p>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                <button onClick={renderVideo} disabled={loading || !script} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed mb-5">
                    {loading && !videoUrl ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            雲端渲染中...
                        </span>
                    ) : "🎬 啟動終極渲染"}
                </button>

                {videoUrl && (
                    <div className="border-t border-slate-100 pt-5 animate-fade-in">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">一鍵全網發布</label>
                        <div className="flex flex-col gap-3 mb-5">
                            {['youtube', 'instagram', 'facebook'].map(platform => (
                                <label key={platform} className={`flex items-center gap-3 cursor-pointer p-3.5 border rounded-xl transition-all ${uploadTargets.includes(platform) ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-white'}`}>
                                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" checked={uploadTargets.includes(platform)} onChange={e => e.target.checked ? setUploadTargets([...uploadTargets, platform]) : setUploadTargets(uploadTargets.filter(t => t !== platform))} />
                                    <span className="text-sm font-bold capitalize text-slate-700">{platform}</span>
                                    {uploadTargets.includes(platform) && <span className="ml-auto text-xs text-indigo-600 font-bold">已就緒</span>}
                                </label>
                            ))}
                        </div>
                        <button onClick={publishVideo} disabled={loading || uploadTargets.length === 0} className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-pink-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0">
                            🚀 確認並推送發布
                        </button>
                    </div>
                )}
            </div>

            {/* 系統日誌雷達 */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                          {loading ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                          )}
                        </span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">系統雷達監控</span>
                    </div>
                </div>
                <div className="bg-slate-900 font-mono text-[11px] leading-relaxed text-emerald-400 p-4 rounded-2xl shadow-inner min-h-[80px] flex items-center">
                    {log ? (
                        <div className="animate-fade-in flex items-start gap-2">
                            <span className="text-slate-500 shrink-0">➜</span>
                            <span className={log.includes('❌') || log.includes('⚠️') ? 'text-rose-400' : 'text-emerald-400'}>{log}</span>
                        </div>
                    ) : (
                        <div className="text-slate-600 w-full text-center animate-pulse">Waiting for commands...</div>
                    )}
                </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};