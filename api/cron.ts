
import admin from 'firebase-admin';
import { PipelineCore } from '../services/pipelineCore';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

export default async function cronHandler(req: any, res: any) {
  // 1. 獲取當前台北時間 (UTC+8)
  const now = new Date();
  const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const currentHour = twTime.getUTCHours().toString().padStart(2, '0');
  const currentMin = twTime.getUTCMinutes().toString().padStart(2, '0');
  const currentDay = twTime.getUTCDay();
  const currentTime = `${currentHour}:${currentMin}`;

  console.log(`[巡邏啟動] 時間: ${currentTime}, 星期: ${currentDay}`);

  try {
    // 2. 更新心跳資訊 (這會讓前端燈號變綠)
    await db.collection("system").doc("status").set({
      lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
      engineStatus: 'online',
      lastPulseTime: currentTime
    }, { merge: true });

    // 3. 掃描頻道
    const snapshot = await db.collection("channels")
      .where("schedule.autoEnabled", "==", true)
      .get();

    const results = [];

    for (const doc of snapshot.docs) {
      const chan = doc.data();
      const sched = chan.schedule;
      
      const isDayMatch = sched.activeDays.includes(currentDay);
      const isTimeMatch = sched.time === currentTime;
      
      // 冷卻：50 分鐘內不重跑
      const lastRun = chan.lastRunTime?.toMillis ? chan.lastRunTime.toMillis() : 0;
      const isCooledDown = (Date.now() - lastRun) > (50 * 60 * 1000);

      if (isDayMatch && isTimeMatch && isCooledDown) {
        results.push(`觸發頻道: ${chan.name}`);
        // 啟動非同步任務
        executePipeline(doc.id, chan);
      } else {
        console.log(`[跳過] ${chan.name}: 時間對不上 (${sched.time} vs ${currentTime}) 或冷卻中`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      currentTime, 
      matched: results 
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 實際執行內容 (不 await，避免超時)
async function executePipeline(id: string, chan: any) {
  const ref = db.collection("channels").doc(id);
  try {
    await ref.update({ status: 'running', lastLog: '雲端引擎開始作業...' });
    
    const trends = await PipelineCore.fetchTrends(chan as any);
    const plan = await PipelineCore.planContent(trends, { niche: chan.niche } as any);
    const video = await PipelineCore.renderVideo(plan);
    const result = await PipelineCore.uploadVideo({
      video_asset: video,
      metadata: plan,
      authCredentials: chan.auth,
      schedule: { privacy_status: 'public' }
    });

    await ref.update({
      status: 'success',
      lastRunTime: admin.firestore.FieldValue.serverTimestamp(),
      lastLog: `✅ 發布成功: ${result.video_id}`
    });
  } catch (e: any) {
    await ref.update({ status: 'error', lastLog: `❌ 錯誤: ${e.message}` });
  }
}
