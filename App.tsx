
import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScheduleConfig, SystemStatus } from './types';
import { db, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { PipelineCore } from './services/pipelineCore';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [processingState, setProcessingState] = useState<{id: string, step: string, percent: number} | null>(null);

  const addLog = (msg: string) => {
    setGlobalLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      // 監聽 Vercel Cron 心跳 (由 api/cron.ts 寫入)
      onSnapshot(doc(db, "system", "status"), (docSnap) => {
        if (docSnap.exists()) {
          setSystemStatus(docSnap.data());
        }
      });

      // 監聽頻道列表
      const q = query(collection(db, "channels"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ ...doc.data() as ChannelConfig, id: doc.id }));
        setChannels(docs);
      });
      return () => unsubscribe();
    }
  }, []);

  const handleManualRun = async (channel: ChannelConfig) => {
    if (processingState) return;
    
    setProcessingState({ id: channel.id, step: '準備中...', percent: 5 });
    addLog(`🚀 手動啟動：${channel.name}`);
    
    try {
      // Step 1: 搜尋趨勢
      setProcessingState({ id: channel.id, step: '正在分析 YouTube 熱門趨勢...', percent: 20 });
      if (db) await updateDoc(doc(db, "channels", channel.id), { status: 'running', lastLog: '正在搜尋趨勢...' });
      const trends = await PipelineCore.fetchTrends(channel);
      
      // Step 2: AI 企劃
      setProcessingState({ id: channel.id, step: 'Gemini 正在規劃影片內容與腳本...', percent: 40 });
      if (db) await updateDoc(doc(db, "channels", channel.id), { lastLog: 'AI 企劃中...' });
      const plan = await PipelineCore.planContent(trends, channel);
      addLog(`[${channel.name}] 企劃完成：${plan.title_template}`);

      // Step 3: Veo 渲染
      setProcessingState({ id: channel.id, step: 'Veo 3.1 影像引擎渲染中 (預計 60s)...', percent: 65 });
      if (db) await updateDoc(doc(db, "channels", channel.id), { lastLog: '影片生成中 (Veo 3.1)...' });
      const video = await PipelineCore.renderVideo(plan);
      addLog(`[${channel.name}] 影片生成成功！`);

      // Step 4: 上傳
      setProcessingState({ id: channel.id, step: '正在將 9:16 影片上傳至 YouTube...', percent: 90 });
      if (db) await updateDoc(doc(db, "channels", channel.id), { lastLog: '上傳至 YouTube...' });
      const result = await PipelineCore.uploadVideo({ video_asset: video, metadata: plan });

      // 完成
      setProcessingState({ id: channel.id, step: '發布完成！', percent: 100 });
      if (db) await updateDoc(doc(db, "channels", channel.id), { 
        status: 'success', 
        lastLog: `✅ 發布成功：${result.video_id}`,
        lastRunTime: serverTimestamp()
      });
      
      addLog(`[${channel.name}] 全自動流程執行成功。`);
      setTimeout(() => setProcessingState(null), 3000);

    } catch (e: any) {
      addLog(`❌ [${channel.name}] 失敗: ${e.message}`);
      if (db) await updateDoc(doc(db, "channels", channel.id), { status: 'error', lastLog: `❌ 錯誤: ${e.message}` });
      setProcessingState(null);
    }
  };

  const toggleAuto = async (channel: ChannelConfig) => {
    if (!db) return;
    const newStatus = !channel.schedule?.autoEnabled;
    await updateDoc(doc(db, "channels", channel.id), {
      "schedule.autoEnabled": newStatus,
      lastLog: `自動化已${newStatus ? '啟動' : '關閉'}`
    });
    addLog(`${channel.name} 自動巡邏：${newStatus ? '開啟' : '關閉'}`);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-4 md:p-10 font-['Plus_Jakarta_Sans']">
      <div className="max-w-7xl mx-auto">
        
        {/* Header - 精簡專業版 */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-500">
              PILOT V8 <span className="text-blue-500 font-light text-2xl">| CLOUD HUB</span>
            </h1>
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              Vercel Cron 全自動巡邏系統
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-3xl shadow-2xl backdrop-blur-xl">
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Cron Pulse</span>
                <div className={`w-2.5 h-2.5 rounded-full ${systemStatus?.engineStatus === 'online' ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)]' : 'bg-red-500'}`}></div>
              </div>
              <p className="text-xs font-mono text-slate-300 mt-1">
                {systemStatus?.lastPulseTime ? `最後巡邏: ${systemStatus.lastPulseTime}` : '等待初次脈搏...'}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* 左側：頻道監控區 */}
          <div className="lg:col-span-8 space-y-8">
            <h2 className="text-lg font-bold text-slate-300 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-sm">📡</span>
              作用中頻道監控 ({channels.length})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {channels.map(chan => {
                const isThisOne = processingState?.id === chan.id;
                return (
                  <div key={chan.id} className={`relative bg-slate-900/50 border rounded-3xl p-6 transition-all duration-500 ${isThisOne ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
                    
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold tracking-tight text-white">{chan.name}</h3>
                        <p className="text-xs text-slate-500 font-medium">{chan.niche} • 排程 {chan.schedule?.time}</p>
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${chan.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : chan.status === 'running' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
                        {chan.status?.toUpperCase() || 'IDLE'}
                      </div>
                    </div>

                    {/* 進度條區域 */}
                    <div className="my-6">
                      <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">
                        <span>{isThisOne ? processingState.step : (chan.lastLog || '等待任務中...')}</span>
                        {isThisOne && <span>{processingState.percent}%</span>}
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-700 ease-out ${chan.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-600 to-cyan-400'}`}
                          style={{ width: `${isThisOne ? processingState.percent : (chan.status === 'success' ? 100 : 0)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => handleManualRun(chan)}
                        disabled={!!processingState}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl text-xs font-black transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                      >
                        {isThisOne ? '程序執行中' : '立即手動生成'}
                      </button>
                      <button 
                        onClick={() => toggleAuto(chan)}
                        className={`px-4 py-3 rounded-2xl text-xs font-black border transition-all ${chan.schedule?.autoEnabled ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-600'}`}
                      >
                        自動: {chan.schedule?.autoEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                );
              })}

              <button className="border-2 border-dashed border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-3 text-slate-600 hover:text-slate-400 hover:border-slate-700 transition-all bg-transparent hover:bg-slate-900/20">
                <span className="text-3xl">+</span>
                <span className="text-xs font-bold uppercase tracking-widest">新增監控頻道</span>
              </button>
            </div>
          </div>

          {/* 右側：日誌區 */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">系統即時日誌</h3>
                <button onClick={() => setGlobalLog([])} className="text-[10px] text-slate-600 hover:text-white transition-colors">CLEAR</button>
              </div>
              <div className="h-[520px] overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                {globalLog.map((log, i) => (
                  <div key={i} className="text-[10px] font-mono text-slate-400 border-l border-slate-800 pl-3 py-1 animate-fade-in">
                    {log}
                  </div>
                ))}
                {globalLog.length === 0 && <div className="text-[10px] text-slate-700 italic text-center py-20">等待通訊資料...</div>}
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-blue-600/5 to-cyan-600/5 rounded-3xl border border-blue-500/10">
              <h4 className="text-xs font-bold text-blue-400 mb-3 uppercase tracking-widest">Vercel 部署提示</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                本系統已完全對接 Vercel Cron。您可以隨時關閉此網頁，伺服器將在後台每分鐘進行自動巡邏，並根據您的排程與 AI 共同協作生成影片。
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
