
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

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  // 統一的路徑構造器
  const getFullUrl = (input: string) => {
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    if (!input.includes('-default-rtdb') && !input.includes('.')) {
      return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
    }
    return `https://${input}.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);

  // 強化後的狀態更新函式
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    try {
      console.log(`[ONYX LOG] ${channel.name}: ${log} (${step}%)`);
      const currentRes = await fetch(DB_URL);
      const allData = await currentRes.json();
      
      let channels = Array.isArray(allData) ? allData : (allData ? Object.values(allData) : []);
      const updated = channels.map((c: any) => 
        c.id === channel.id ? { ...c, step, lastLog: log, status } : c
      );
      
      await fetch(DB_URL, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated) 
      });
    } catch (e) {
      console.error("[Update Status Failed]", e);
    }
  };

  try {
    if (stage === 'full_flow') {
      await updateStatus(15, "🔍 正在聯繫 Gemini 分析趨勢...");
      
      const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      // 1. 生成劇本
      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Niche: ${channel.niche}. Language: ${targetLang}. Create a viral YouTube Short.`,
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

      let metadata;
      try {
        // 清理可能存在的 Markdown 標籤
        const cleanJson = (promptRes.text || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
        metadata = JSON.parse(cleanJson);
      } catch (parseErr) {
        throw new Error("Gemini 回傳了無效的 JSON 格式。內容: " + promptRes.text?.substring(0, 50));
      }

      if (!metadata.visual_prompt) throw new Error("劇本內容生成失敗。");

      // 2. 影片渲染 (Veo)
      await updateStatus(40, "🎬 正在透過 Veo 渲染影片 (這可能需要數分鐘)...");
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 30) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(Math.min(90, 40 + (attempts * 2)), `🎬 影片生成中... (${attempts * 10}秒)`);
      }

      if (!operation.done) throw new Error("Veo 影片生成逾時，請檢查 Google Cloud 配額。");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      // 3. 上傳邏輯
      if (channel.auth?.access_token) {
        await updateStatus(95, "🚀 正在發送到 YouTube...");
        const boundary = '-------314159265358979323846';
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
        if (!uploadRes.ok) throw new Error("YouTube API 回報上傳錯誤。");
      }

      await updateStatus(100, "✅ 任務大功告成！", 'success');
      
      // 寫入歷史紀錄
      const lastFetch = await fetch(DB_URL);
      const historyChannels = await lastFetch.json();
      const updatedHistory = (Array.isArray(historyChannels) ? historyChannels : Object.values(historyChannels)).map((c: any) => {
        if (c.id === channel.id) {
          const hist = c.history || [];
          hist.unshift({ title: metadata.title, publishedAt: new Date().toISOString() });
          return { ...c, history: hist.slice(0, 10), status: 'idle', step: 0, lastLog: '任務完成，待命' };
        }
        return c;
      });
      await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(updatedHistory) });

      return res.status(200).json({ success: true });
    }
  } catch (e: any) {
    console.error("[ONYX CRITICAL ERROR]", e);
    await updateStatus(0, `❌ 流程中斷: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
