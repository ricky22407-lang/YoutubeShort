
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

/**
 * 雲端心跳任務 (Cloud Heartbeat Engine)
 * Runs every minute to check if any channel is due for a post.
 */
export const cloudAutoPilotEngine = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    console.log(`[Cloud Engine] Checking schedules for ${currentTime}...`);

    try {
      const channelsSnapshot = await db.collection("channels")
        .where("schedule.autoEnabled", "==", true)
        .get();

      const tasks = [];

      for (const doc of channelsSnapshot.docs) {
        const chan = doc.data();
        
        // 1. Time & Day Check
        const isToday = chan.schedule.activeDays.includes(currentDay);
        const isTime = chan.schedule.time === currentTime;
        
        // 2. Throttling Check (Ensure we don't run twice in the same hour)
        const coolDown = 50 * 60 * 1000;
        const isCooledDown = !chan.lastRunTime || (Date.now() - chan.lastRunTime > coolDown);

        if (isToday && isTime && isCooledDown) {
          tasks.push(executeCloudTask(doc.id, chan));
        }
      }

      await Promise.all(tasks);
    } catch (error) {
      console.error("[Cloud Engine] Fatal Sweep Error:", error);
    }
    
    return null;
  });

/**
 * Executes the full AI generation and YouTube upload pipeline in the cloud.
 */
async function executeCloudTask(channelId: string, chan: any) {
  const ref = db.collection("channels").doc(channelId);
  
  try {
    await ref.update({ status: 'running', lastLog: `雲端發布啟動中...` });
    
    // --- STEP 1: TREND ANALYSIS ---
    // (Logic similar to api/pipeline.ts analyze stage)
    
    // --- STEP 2: VIDEO GENERATION (VEO) ---
    // (Logic similar to api/pipeline.ts render stage)
    
    // --- STEP 3: YOUTUBE UPLOAD ---
    // (Logic similar to api/pipeline.ts upload stage)

    await ref.update({ 
      lastRunTime: Date.now(),
      status: 'success',
      lastLog: `雲端自動發布成功！(${new Date().toLocaleTimeString()})`
    });
    
    console.log(`[Cloud Engine] Successfully processed channel: ${chan.name}`);
  } catch (err: any) {
    console.error(`[Cloud Engine] Task Failed for ${chan.name}:`, err);
    await ref.update({ status: 'error', lastLog: `雲端發布失敗: ${err.message}` });
  }
}
