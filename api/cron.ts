
import admin from 'firebase-admin';
import { PipelineCore } from '../services/pipelineCore';

// 初始化 Firebase Admin (使用 Vercel 環境變數)
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;

  if (!privateKey || !clientEmail || !projectId) {
    console.error("[Cron Initialization] 關鍵環境變數缺失:", { 
      hasKey: !!privateKey, 
      hasEmail: !!clientEmail, 
      hasProjectId: !!projectId 
    });
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          // 處理 Vercel 中私鑰換行符號的問題
          privateKey: privateKey.includes('---') ? privateKey.replace(/\\n/g, '\n') : privateKey,
        })
      });
      console.log("[Cron Initialization] Firebase Admin SDK 初始化成功");
    } catch (e) {
      console.error("[Cron Initialization] 初始化失敗:", e);
    }
  }
}

const db = admin.firestore();

export default async function cronHandler(req: any, res: any) {
  // 取得台北時間 (UTC+8)
  const now = new Date();
  const twTimeObj = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  
  const currentHour = twTimeObj.getUTCHours().toString().padStart(2, '0');
  const currentMin = twTimeObj.getUTCMinutes().toString().padStart(2, '0');
  const currentDay = twTimeObj.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const currentTimeStr = `${currentHour}:${currentMin}`;

  console.log(`[Vercel Cron] 啟動巡邏 | 台北時間: ${currentTimeStr} | 星期: ${currentDay}`);

  try {
    // 1. 強制更新心跳 (無論是否有任務，這會讓前端綠燈亮起)
    await db.collection("system").doc("status").set({
      lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
      engineStatus: 'online',
      source: 'Vercel-Cron',
      lastPulse: currentTimeStr
    }, { merge: true });

    // 2. 獲取所有啟用自動化的頻道
    const snapshot = await db.collection("channels")
      .where("schedule.autoEnabled", "==", true)
      .get();

    console.log(`[Vercel Cron] 掃描中... 共有 ${snapshot.size} 個自動化頻道`);

    if (snapshot.empty) {
      return res.status(200).json({ success: true, message: "目前無啟用的自動化頻道" });
    }

    const tasksExecuted = [];

    for (const doc of snapshot.docs) {
      const chan = doc.data();
      const sched = chan.schedule;
      
      const isDayMatch = sched.activeDays.includes(currentDay);
      const isTimeMatch = sched.time === currentTimeStr;
      
      // 冷卻時間檢查 (50分鐘內不重跑)
      const lastRun = chan.lastRunTime?.toMillis ? chan.lastRunTime.toMillis() : (chan.lastRunTime || 0);
      const isCooledDown = (Date.now() - lastRun) > (50 * 60 * 1000);

      console.log(`[檢查頻道] ${chan.name}: 時間符合=${isTimeMatch}, 星期符合=${isDayMatch}, 冷卻完成=${isCooledDown}`);

      if (isDayMatch && isTimeMatch && isCooledDown) {
        console.log(`[執行自動化] 正在啟動頻道任務: ${chan.name}`);
        tasksExecuted.push(chan.name);
        // 注意：Vercel Function 有執行時間限制
        await executeTask(doc.id, chan);
      }
    }

    return res.status(200).json({ 
      success: true, 
      pulse: currentTimeStr,
      executed: tasksExecuted
    });

  } catch (error: any) {
    console.error("[Cron Fatal Error]:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function executeTask(id: string, chan: any) {
  const ref = db.collection("channels").doc(id);
  try {
    await ref.update({ 
      status: 'running', 
      lastLog: `[${new Date().toLocaleTimeString()}] 雲端自動發布流程啟動...` 
    });

    // 呼叫核心邏輯
    const trends = await PipelineCore.fetchTrends(chan as any);
    const plan = await PipelineCore.planContent(trends, { niche: chan.niche } as any);
    
    await ref.update({ lastLog: `[${new Date().toLocaleTimeString()}] AI 企劃完成，準備生成影片...` });
    
    const video = await PipelineCore.renderVideo(plan);
    
    await ref.update({ lastLog: `[${new Date().toLocaleTimeString()}] 影片渲染成功，上傳中...` });
    
    const result = await PipelineCore.uploadVideo({
      video_asset: video,
      metadata: plan,
      authCredentials: chan.auth,
      schedule: { privacy_status: 'public' }
    });

    await ref.update({
      status: 'success',
      lastRunTime: admin.firestore.FieldValue.serverTimestamp(),
      lastLog: `✅ 雲端自動發布成功！影片ID: ${result.video_id}`
    });
    console.log(`[SUCCESS] ${chan.name} 任務圓滿完成`);

  } catch (e: any) {
    console.error(`[TASK FAILED] ${chan.name}:`, e);
    await ref.update({ 
      status: 'error', 
      lastLog: `❌ 雲端任務失敗: ${e.message}` 
    });
  }
}
