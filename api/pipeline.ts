
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

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return res.status(200).json({ success: false, error: '環境變數 API_KEY 遺失' });

  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  const getFullUrl = (input: string) => {
    if (!input) return null;
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    if (input.includes('.')) {
      const parts = input.split('.');
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }
    return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);
  if (!DB_URL) return res.status(200).json({ success: false, error: 'Firebase 網址構造失敗' });

  // 狀態更新：確保非同步執行且不阻塞主流程
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    console.log(`[PIPELINE] Updating: ${log} (${step}%)`);
    try {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) return;
      
      const raw = await dbRes.json();
      let channels = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
      
      const updated = channels.map((c: any) => 
        c.id === channel.id ? { ...c, step, lastLog: log, status } : c
      );
      
      await fetch(DB_URL, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated) 
      });
    } catch (e) {
      console.error("[PIPELINE STATUS ERROR]", e);
    }
  };

  try {
    if (stage === 'full_flow') {
      // 步驟 1：診斷連線
      await updateStatus(10, "📡 正在確認雲端引擎與資料庫連線...");
      const testRes = await fetch(DB_URL);
      if (!testRes.ok) throw new Error("Firebase 資料庫無法連接，請檢查 Rules 或 Project ID。");

      // 步驟 2：Gemini 構思劇本
      await updateStatus(25, "🔍 正在聯繫 Gemini 分析趨勢並撰寫劇本...");
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `你是一位短影音行銷大師。請針對 Niche: ${channel.niche} 使用語言: ${targetLang} 產出一個具備病毒式傳播潛力的 YouTube Short 企劃。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visual_prompt: { type: Type.STRING, description: "給影片生成模型的詳細視覺描述，包含鏡頭與燈光" },
              title: { type: Type.STRING, description: "影片標題 (含 Emoji)" },
              description: { type: Type.STRING, description: "影片描述 (含 Hashtags)" }
            },
            required: ["visual_prompt", "title", "description"]
          }
        }
      });

      let metadata;
      try {
        const text = response.text || '';
        metadata = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (parseErr) {
        console.error("Gemini Response Raw:", response.text);
        throw new Error("AI 回傳劇本格式錯誤，無法解析。");
      }

      // 步驟 3：Veo 影片渲染
      await updateStatus(45, "🎬 正在啟動 Veo 3.1 渲染垂直影片 (預計 120-180 秒)...");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 50) {
        await new Promise(r => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(Math.min(90, 45 + (attempts * 1)), `🎬 影片生成中 (${attempts * 8}秒)...`);
      }

      if (!operation.done) throw new Error("影片渲染時間超過 400 秒，已自動放棄。");

      // 步驟 4：下載與處理
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoFetch = await fetch(`${downloadLink}&key=${API_KEY}`);
      if (!videoFetch.ok) throw new Error("影片下載失敗。");
      const videoBuffer = Buffer.from(await videoFetch.arrayBuffer());

      // 步驟 5：YouTube 上傳 (如果有的話)
      if (channel.auth?.access_token) {
        await updateStatus(95, "🚀 正在發布至 YouTube 頻道...");
        const boundary = '-------ONYX_PIPELINE_BOUNDARY';
        const metadataPart = JSON.stringify({
          snippet: { title: metadata.title, description: metadata.description + "\n#shorts #ai #onyx" },
          status: { privacyStatus: "public" }
        });
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
        if (!uploadRes.ok) console.warn("YouTube 上傳失敗，但影片已生成。");
      }

      // 成功結束
      await updateStatus(100, "✅ 任務大功告成", 'success');
      
      // 清理頻道狀態為待命
      setTimeout(async () => {
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
      }, 5000);

      return res.status(200).json({ success: true });

    }
  } catch (e: any) {
    console.error("[PIPELINE CRITICAL]", e.message);
    await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
