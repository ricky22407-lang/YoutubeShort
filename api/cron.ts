
import { NextRequest, NextResponse } from 'next/server';

export const config = {
  maxDuration: 300,
};

/**
 * 核心排程邏輯：每小時檢查一次
 * Vercel Cron 每小時造訪此路徑。
 */
export default async function handler(req: NextRequest) {
  // 為了安全，檢查 Vercel 特有的 Header (若有設定 CRON_SECRET)
  // if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) { ... }

  console.log("[Cron] 啟動每小時排程檢查...");

  try {
    // 1. 從 Firebase REST API 讀取所有頻道 (不依賴瀏覽器)
    // 假設你的 Firebase Project ID 是 `my-project`
    const DB_URL = `https://${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseio.com/channels.json`;
    const dbRes = await fetch(DB_URL);
    const channelsMap = await dbRes.json();
    
    if (!channelsMap) return NextResponse.json({ success: true, message: "沒有頻道資料" });

    const channels: any[] = Object.values(channelsMap);
    const now = new Date();
    const currentDay = now.getDay();
    // 格式為 HH:00 (因為 Cron 是整點觸發)
    const currentTime = now.getHours().toString().padStart(2, '0') + ':00'; 

    const tasks = [];

    for (const chan of channels) {
      if (!chan.schedule?.autoEnabled || !chan.auth) continue;

      const isToday = chan.schedule.activeDays.includes(currentDay);
      // 精準比對小時 (例如 19:00)
      const isTime = chan.schedule.time.startsWith(now.getHours().toString().padStart(2, '0')); 
      
      const coolDown = 2 * 60 * 60 * 1000; // 2小時內不重複發片
      const isCooledDown = !chan.lastRunTime || (Date.now() - chan.lastRunTime > coolDown);

      if (isToday && isTime && isCooledDown) {
        console.log(`[Cron] 觸發任務：頻道「${chan.name}」時間到 (${chan.schedule.time})`);
        
        // 2. 直接呼叫內部 Pipeline API
        const pipelineUrl = `https://${req.headers.get('host')}/api/pipeline`;
        tasks.push(
          fetch(pipelineUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              stage: 'full_flow', 
              channel: chan,
              source: 'cron' 
            })
          }).then(r => r.json())
        );
      }
    }

    const results = await Promise.allSettled(tasks);
    console.log(`[Cron] 完成。觸發任務數: ${tasks.length}`, results);

    return NextResponse.json({ 
      success: true, 
      triggeredCount: tasks.length,
      timestamp: new Date().toISOString() 
    });

  } catch (error: any) {
    console.error("[Cron Error]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
