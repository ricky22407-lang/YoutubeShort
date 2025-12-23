
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

  // 核心修復：與 api/db.ts 完全一致的網址構造邏輯
  const getFullUrl = (input: string) => {
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    if (!input.includes('-default-rtdb') && !input.includes('.')) {
      return `https://${input}-default-rtdb.firebaseio.com/channels.json`;
    }
    if (input.includes('.')) {
      const parts = input.split('.');
      // 處理如 project-id.asia-southeast1 格式
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }
    return `https://${input}.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);

  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    try {
      const currentRes = await fetch(DB_URL);
      if (!currentRes.ok) throw new Error(`DB Read Fail: ${currentRes.status}`);
      
      const allData = await currentRes.json();
      let channels = Array.isArray(allData) ? allData : (allData ? Object.values(allData) : []);
      
      const updated = channels.map((c: any) => 
        c.id === channel.id ? { ...c, step, lastLog: log, status } : c
      );
      
      const saveRes = await fetch(DB_URL, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated) 
      });
      if (!saveRes.ok) throw new Error(`DB Write Fail: ${saveRes.status}`);
    } catch (e: any) {
      console.error("[Update Status Error]", e.message);
    }
  };

  try {
    if (stage === 'full_flow') {
      await updateStatus(15, "🔍 正在分析趨勢並撰寫劇本...");
      
      const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Niche: ${channel.niche}. Language: ${targetLang}. Create a viral YouTube Short. Output JSON only.`,
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

      const text = response.text;
      if (!text) throw new Error("AI 未能產出劇本。");
      const metadata = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

      await updateStatus(40, "🎬 正在透過 Veo 3.1 渲染影片...");
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      let attempts = 0;
      while (!operation.done && attempts < 40) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
        attempts++;
        await updateStatus(Math.min(95, 40 + attempts), `🎬 影片生成中 (${attempts * 10}秒)...`);
      }

      if (!operation.done) throw new Error("影片生成逾時，請稍後檢查 YouTube 或重試。");

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      if (channel.auth?.access_token) {
        await updateStatus(95, "🚀 正在發布至 YouTube...");
        const boundary = '-------314159265358979323846';
        const metadataPart = JSON.stringify({
          snippet: { title: metadata.title, description: metadata.description + "\n#shorts #onyx" },
          status: { privacyStatus: "public" }
        });
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`),
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
      
      // 更新歷史與重置狀態
      const finalFetch = await fetch(DB_URL);
      const historyData = await finalFetch.json();
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
    await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
