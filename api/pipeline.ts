
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel } = req.body;
  if (!channel || !channel.id) return res.status(400).json({ error: 'Missing channel ID' });

  // 1. 環境變數預檢
  if (!process.env.API_KEY) return res.status(200).json({ success: false, error: '遺失 API_KEY，請在 Vercel 設定。' });

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  const getFullUrl = (input: string) => {
    if (!input) return null;
    // 如果是完整網址直接用
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    // 處理帶地區點號 (例如 onyx-123.asia-southeast1)
    if (input.includes('.')) {
      const parts = input.split('.');
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }
    // 預設為新版 Firebase RTDB 格式
    return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);
  if (!DB_URL) return res.status(200).json({ success: false, error: 'Firebase 專案 ID 未設定或格式錯誤。' });

  // 狀態更新函式
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    try {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) throw new Error(`讀取失敗 (${dbRes.status})`);
      
      const raw = await dbRes.json();
      let channels = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
      
      // 修復邏輯：如果資料庫裡沒有該頻道，先插入一筆
      const exists = channels.find((c: any) => c.id === channel.id);
      let updated;
      if (!exists) {
        updated = [...channels, { ...channel, step, lastLog: log, status }];
      } else {
        updated = channels.map((c: any) => 
          c.id === channel.id ? { ...c, step, lastLog: log, status } : c
        );
      }
      
      const saveRes = await fetch(DB_URL, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated) 
      });
      if (!saveRes.ok) throw new Error(`寫入失敗 (${saveRes.status})`);
    } catch (e: any) {
      console.error("[PIPELINE DB UPDATE ERROR]", e.message);
      // 注意：這裡不拋出錯誤，以免 pipeline 本身中斷，但後台會噴 Log
    }
  };

  try {
    if (stage === 'full_flow') {
      // 第一階段：資料庫連線測試 (直接回傳失敗，如果連資料庫都找不到)
      console.log(`[Diagnostic] Testing DB URL: ${DB_URL}`);
      const testRes = await fetch(DB_URL);
      if (!testRes.ok) {
        return res.status(200).json({ 
          success: false, 
          error: `無法連線至 Firebase。網址：${DB_URL}。狀態：${testRes.status}。請確認專案 ID 是否正確，且 Realtime Database 已建立。` 
        });
      }

      await updateStatus(10, "🔍 正在聯繫 Gemini 構思劇本...");

      const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `你是一位短影音行銷大師。請針對 Niche: ${channel.niche} 產出一個具備病毒式傳播潛力的 YouTube Short 企劃。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visual_prompt: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["visual_prompt", "title", "description"]
          }
        }
      });

      const metadata = JSON.parse(response.text.replace(/```json/g, '').replace(/```/g, '').trim());

      await updateStatus(40, "🎬 正在透過 Veo 渲染影片 (預計 2-3 分鐘)...");
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 50) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(Math.min(90, 40 + attempts), `🎬 影片生成中 (${attempts * 10}秒)...`);
      }

      if (!operation.done) throw new Error("影片生成逾時，後端已中斷。");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      if (channel.auth?.access_token) {
        await updateStatus(95, "🚀 正在發布至 YouTube...");
        const boundary = '-------PIPELINE_BOUNDARY';
        const metadataPart = JSON.stringify({
          snippet: { title: metadata.title, description: metadata.description },
          status: { privacyStatus: "public" }
        });
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadataPart}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
      }

      await updateStatus(100, "✅ 任務大功告成", 'success');
      
      // 最後清理狀態
      const finalRes = await fetch(DB_URL);
      const historyData = await finalRes.json();
      const finalUpdated = (Array.isArray(historyData) ? historyData : Object.values(historyData)).map((c: any) => {
        if (c.id === channel.id) {
          const hist = c.history || [];
          hist.unshift({ title: metadata.title, publishedAt: new Date().toISOString() });
          return { ...c, history: hist.slice(0, 10), status: 'idle', step: 0, lastLog: '待命' };
        }
        return c;
      });
      await fetch(DB_URL, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(finalUpdated) });

      return res.status(200).json({ success: true });
    }
  } catch (e: any) {
    console.error("[PIPELINE FATAL]", e);
    await updateStatus(0, `❌ 失敗: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
