
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
  // 強制校準台北時間
  const now = new Date();
  const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const hour = twTime.getUTCHours().toString().padStart(2, '0');
  const min = twTime.getUTCMinutes().toString().padStart(2, '0');
  const day = twTime.getUTCDay();
  const currentTime = `${hour}:${min}`;

  console.log(`[Vercel Cron] 巡邏中... 台北時間: ${currentTime}`);

  try {
    // 1. 紀錄巡邏脈搏
    await db.collection("system").doc("status").set({
      lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
      engineStatus: 'online',
      lastPulseTime: currentTime
    }, { merge: true });

    // 2. 搜尋排程頻道
    const snapshot = await db.collection("channels")
      .where("schedule.autoEnabled", "==", true)
      .get();

    const tasks = [];
    for (const doc of snapshot.docs) {
      const chan = doc.data();
      const sched = chan.schedule;
      
      const isDay = sched.activeDays.includes(day);
      const isTime = sched.time === currentTime;
      
      const lastRun = chan.lastRunTime?.toMillis ? chan.lastRunTime.toMillis() : 0;
      const cooledDown = (Date.now() - lastRun) > (50 * 60 * 1000);

      if (isDay && isTime && cooledDown) {
        console.log(`[觸發任務] 頻道: ${chan.name}`);
        tasks.push(runTask(doc.id, chan));
      }
    }

    await Promise.all(tasks);
    return res.status(200).json({ success: true, pulse: currentTime });

  } catch (error: any) {
    console.error("[Cron Error]", error);
    return res.status(500).json({ error: error.message });
  }
}

async function runTask(id: string, chan: any) {
  const ref = db.collection("channels").doc(id);
  try {
    await ref.update({ status: 'running', lastLog: '雲端自動化執行中...' });
    
    const trends = await PipelineCore.fetchTrends(chan);
    const plan = await PipelineCore.planContent(trends, chan);
    const video = await PipelineCore.renderVideo(plan);
    const result = await PipelineCore.uploadVideo({ video_asset: video, metadata: plan });

    await ref.update({
      status: 'success',
      lastRunTime: admin.firestore.FieldValue.serverTimestamp(),
      lastLog: `✅ 雲端自動發布成功！影片ID: ${result.video_id}`
    });
  } catch (e: any) {
    await ref.update({ status: 'error', lastLog: `❌ 雲端自動化失敗: ${e.message}` });
  }
}
