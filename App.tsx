
import React, { useState, useEffect } from 'react';
import { ChannelConfig, ScheduleConfig } from './types';
import { db, isFirebaseConfigured } from './firebase';
import { 
  collection, onSnapshot, query, doc, updateDoc, 
  deleteDoc, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { PipelineCore } from './services/pipelineCore';

const App: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [globalLog, setGlobalLog] = useState<string[]>([]);
  const [processingState, setProcessingState] = useState<{id: string, step: string, percent: number} | null>(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', niche: '', time: '19:00' });

  const addLog = (msg: string) => {
    setGlobalLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      addLog("⚠️ Firebase 未配置，請檢查環境變數。");
      return;
    }

    // 監聽系統狀態
    const unsubStatus = onSnapshot(doc(db, "system", "status"), (docSnap) => {
      if (docSnap.exists()) setSystemStatus(docSnap.data());
    });

    // 監聽頻道列表 (確保獲取物理 Document ID)
    const q = query(collection(db, "channels"));
    const unsubChannels = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          ...data,
          id: doc.id // 強制覆蓋為 Firestore 的物理 ID
        } as ChannelConfig;
      });
      console.log("Current Channels in DB:", docs);
      setChannels(docs);
    }, (error) => {
      addLog("讀取資料失敗: " + error.message);
    });

    return () => {
      unsubStatus();
      unsubChannels();
    };
  }, []);

  const handleManualRun = async (channel: ChannelConfig) => {
    if (processingState) return;
    
    // 初始化 UI 狀態
    setProcessingState({ id: channel.id, step: '初始化引擎...', percent: 5 });
    addLog(`🚀 [${channel.name}] 手動觸發啟動...`);
    
    try {
      const chanRef = doc(db, "channels", channel.id);
      
      // 1. 搜尋趨勢
      setProcessingState({ id: channel.id, step: '正在分析 YouTube 趨勢...', percent: 20 });
      await updateDoc(chanRef, { status: 'running', lastLog: '正在搜尋趨勢...' });
      const trends = await PipelineCore.fetchTrends(channel);
      
      // 2. AI 企劃
      setProcessingState({ id: channel.id, step: 'Gemini 正在撰寫腳本與企劃...', percent: 45 });
      await updateDoc(chanRef, { lastLog: 'AI 企劃中...' });
      const plan = await PipelineCore.planContent(trends, channel);
      addLog(`[${channel.name}] 企劃完成：${plan.title_template}`);
      
      // 3. Veo 渲染
      setProcessingState({ id: channel.id, step: 'Veo 3.1 正在生成 9:16 影片...', percent: 70 });
      await updateDoc(chanRef, { lastLog: '影片生成中 (Veo 3.1)...' });
      const video = await PipelineCore.renderVideo(plan);
      addLog(`[${channel.name}] 影片渲染成功`);

      // 4. 上傳
      setProcessingState({ id: channel.id, step: '上傳至 YouTube...', percent: 90 });
      await updateDoc(chanRef, { lastLog: '上傳中...' });
      const result = await PipelineCore.uploadVideo({ video_asset: video, metadata: plan });

      // 成功結束
      setProcessingState({ id: channel.id, step: '執行成功！', percent: 100 });
      await updateDoc(chanRef, { 
        status: 'success', 
        lastLog: `✅ 發布成功: ${result.video_id}`,
        lastRunTime: serverTimestamp()
      });
      
      addLog(`✅ [${channel.name}] 任務圓滿完成`);
      setTimeout(() => setProcessingState(null), 3000);

    } catch (e: any) {
      addLog(`❌ [${channel.name}] 失敗: ${e.message}`);
      if (db) {
        await updateDoc(doc(db, "channels", channel.id), { 
          status: 'error', 
          lastLog: `❌ 錯誤: ${e.message}` 
        });
      }
      setProcessingState(null);
    }
  };

  const createChannel = async () => {
    if (!db || !newChannel.name) return;
    try {
      await addDoc(collection(db, "channels"), {
        name: newChannel.name,
        niche: newChannel.niche || 'General',
        status: 'idle',
        lastLog: '新頻道已建立',
        schedule: {
          activeDays: [0, 1, 2, 3, 4, 5, 6],
          time: newChannel.time,
          autoEnabled: false,
          countPerDay: 1
        }
      });
      setShowAddModal(false);
      setNewChannel({ name: '', niche: '', time: '19:00' });
      addLog(`頻道「${newChannel.name}」建立完成。`);
    } catch (e: any) {
      addLog("建立失敗: " + e.message);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!db || !id) return;
    if (!confirm("確定要刪除此頻道？這會永久移除其所有排程資料。")) return;
    
    try {
      addLog(`正在刪除頻道 ${id}...`);
      await deleteDoc(doc(db, "channels", id));
      addLog("頻道已從雲端徹底移除。");
    } catch (e: any) {
      addLog("刪除過程出錯: " + e.message);
      console.error("Delete Error:", e);
    }
  };

  const toggleAuto = async (channel: ChannelConfig) => {
    if (!db) return;
    const newStatus = !channel.schedule?.autoEnabled;
    try {
      await updateDoc(doc(db, "channels", channel.id), {
        "schedule.autoEnabled": newStatus
      });
      addLog(`${channel.name} 自動巡邏: ${newStatus ? '啟動' : '關閉'}`);
    } catch (e: any) {
      addLog("更新失敗: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-6 md:p-12 font-['Plus_Jakarta_Sans'] selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-8 animate-fade-in">
          <div>
            <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-400 to-cyan-500 mb-2">
              PILOT V8
            </h1>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-bold tracking-widest uppercase">
                Vercel Cloud Ready
              </span>
              <p className="text-slate-500 text-xs font-medium">全自動雲端短影音矩陣</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6 bg-slate-900/40 border border-white/5 p-5 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl">
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cron Heartbeat</span>
                <div className={`w-2.5 h-2.5 rounded-full ${systemStatus?.engineStatus === 'online' ? 'bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-pulse' : 'bg-red-500'}`}></div>
              </div>
              <p className="text-sm font-mono text-slate-200">
                {systemStatus?.lastPulseTime ? `最後巡邏: ${systemStatus.lastPulseTime}` : '雲端引擎待機中'}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-10">
            <div className="flex justify-between items-end">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-xl shadow-lg shadow-blue-900/20">📡</span>
                活躍頻道控盤
              </h2>
              <button 
                onClick={() => setShowAddModal(true)}
                className="px-6 py-2.5 bg-white text-black rounded-xl text-xs font-black hover:bg-blue-400 hover:text-white transition-all shadow-lg active:scale-95"
              >
                + 新增監控頻道
              </button>
            </div>

            {channels.length === 0 ? (
              <div className="border-2 border-dashed border-slate-800 rounded-[2.5rem] p-20 text-center text-slate-600">
                目前沒有監控中的頻道，請點擊右上方按鈕新增。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {channels.map(chan => {
                  const isBusy = processingState?.id === chan.id;
                  return (
                    <div key={chan.id} className={`group relative bg-slate-900/30 border rounded-[2.5rem] p-8 transition-all duration-500 ${isBusy ? 'border-blue-500 ring-1 ring-blue-500/50 bg-slate-900/60 scale-[1.02]' : 'border-white/5 hover:border-white/10'}`}>
                      
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold tracking-tight text-white group-hover:text-blue-400 transition-colors truncate pr-4">{chan.name}</h3>
                          <p className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-widest">{chan.niche} • 排程 {chan.schedule?.time}</p>
                        </div>
                        <button 
                          onClick={() => deleteChannel(chan.id)}
                          className="p-2 text-slate-700 hover:text-red-500 transition-all rounded-full hover:bg-red-500/10"
                          title="刪除頻道"
                        >
                          ✕
                        </button>
                      </div>

                      {/* 進度條區域 */}
                      <div className="mb-8">
                        <div className="flex justify-between text-[10px] font-black text-slate-400 mb-3 uppercase tracking-tighter">
                          <span className={isBusy ? 'text-blue-400' : ''}>
                            {isBusy ? processingState.step : (chan.lastLog || '等待任務中...')}
                          </span>
                          {isBusy && <span>{processingState.percent}%</span>}
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 ease-in-out ${chan.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500'}`}
                            style={{ width: `${isBusy ? processingState.percent : (chan.status === 'success' ? 100 : 0)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => handleManualRun(chan)}
                          disabled={!!processingState}
                          className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-2xl text-[11px] font-black tracking-widest transition-all shadow-2xl shadow-blue-900/40 active:scale-95 uppercase"
                        >
                          {isBusy ? 'Processing...' : 'Manual Fire'}
                        </button>
                        {/* Fix: use 'chan' instead of 'channel' to match map iterator scope */}
                        <button 
                          onClick={() => toggleAuto(chan)}
                          className={`px-6 py-4 rounded-2xl text-[11px] font-black border transition-all uppercase tracking-widest ${chan.schedule?.autoEnabled ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-slate-900/50 border-white/5 text-slate-600'}`}
                        >
                          Auto: {chan.schedule?.autoEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Log / Telemetry Side Panel */}
          <div className="lg:col-span-4">
             <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-xl h-full flex flex-col min-h-[500px]">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Telemetry Feed</h3>
                  <button onClick={() => setGlobalLog([])} className="text-[10px] text-slate-700 hover:text-white transition-colors">RESET</button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-none">
                  {globalLog.map((log, i) => (
                    <div key={i} className="text-[10px] font-mono text-slate-400 border-l border-white/5 pl-4 py-1 leading-relaxed animate-fade-in">
                      {log}
                    </div>
                  ))}
                  {globalLog.length === 0 && <div className="text-[10px] text-slate-800 italic text-center py-32">WAITING FOR DATA...</div>}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Add Channel Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fade-in">
          <div className="bg-[#020617] border border-white/10 rounded-[3rem] p-10 max-w-md w-full shadow-2xl animate-slide-down">
            <h2 className="text-3xl font-black mb-2 text-white tracking-tighter">新增監控任務</h2>
            <p className="text-slate-500 text-sm mb-8">配置您的 AI 全自動內容矩陣</p>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block pl-1">頻道名稱</label>
                <input 
                  type="text" 
                  value={newChannel.name}
                  onChange={e => setNewChannel({...newChannel, name: e.target.value})}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                  placeholder="例如: 科技實驗室"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block pl-1">頻道定位 (Niche)</label>
                <input 
                  type="text" 
                  value={newChannel.niche}
                  onChange={e => setNewChannel({...newChannel, niche: e.target.value})}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                  placeholder="例如: Tech, Science, ASMR"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block pl-1">排程時間 (每日執行)</label>
                <input 
                  type="time" 
                  value={newChannel.time}
                  onChange={e => setNewChannel({...newChannel, time: e.target.value})}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={createChannel} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/40 hover:bg-blue-500 transition-all active:scale-95">建立任務</button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
