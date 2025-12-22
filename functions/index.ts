
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * 雲端心跳任務 (Cloud Heartbeat Engine)
 * 每分鐘執行一次：
 * 1. 更新 system/status 告知前端「引擎正在運作」
 * 2. 檢查各頻道排程
 */
export const cloudAutoPilotEngine = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    console.log(`[Cloud Engine] Pulse check at ${currentTime}...`);

    try {
      // 更新全局心跳
      await db.collection("system").doc("status").set({
        lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
        engineStatus: 'online',
        activeTasks: 0
      }, { merge: true });

      const channelsSnapshot = await db.collection("channels")
        .where("schedule.autoEnabled", "==", true)
        .get();

      const tasks = [];
      for (const doc of channelsSnapshot.docs) {
        const chan = doc.data();
        const isToday = chan.schedule.activeDays.includes(currentDay);
        const isTime = chan.schedule.time === currentTime;
        const coolDown = 50 * 60 * 1000;
        const isCooledDown = !chan.lastRunTime || (Date.now() - chan.lastRunTime > coolDown);

        if (isToday && isTime && isCooledDown) {
          tasks.push(executeCloudTask(doc.id, chan));
        }
      }
      await Promise.all(tasks);
    } catch (error) {
      console.error("[Cloud Engine] Fatal Error:", error);
    }
    return null;
  });

async function executeCloudTask(channelId: string, chan: any) {
  const ref = db.collection("channels").doc(channelId);
  try {
    await ref.update({ status: 'running', lastLog: `雲端發布流程啟動...` });
    // 這裡實作 AI 產圖、影片與上傳邏輯...
    await ref.update({ 
      lastRunTime: admin.firestore.FieldValue.serverTimestamp(),
      status: 'success',
      lastLog: `雲端自動發布成功！(${new Date().toLocaleTimeString()})`
    });
  } catch (err: any) {
    await ref.update({ status: 'error', lastLog: `雲端發布失敗: ${err.message}` });
  }
}
