
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const FIREBASE_ID = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
  const DB_URL = `https://${FIREBASE_ID}.firebaseio.com/channels.json`;

  // 輔助函式：更新 Firebase 狀態
  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    try {
      const currentRes = await fetch(DB_URL);
      const allData = await currentRes.json();
      const channels = Array.isArray(allData) ? allData : Object.values(allData);
      const updated = channels.map((c: any) => 
        c.id === channel.id ? { ...c, step, lastLog: log, status } : c
      );
      await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(updated) });
    } catch (e) { console.error("Update fail", e); }
  };

  try {
    if (stage === 'analyze') {
      const lang = channel.language || 'zh-TW';
      const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      
      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Niche: ${channel.niche}. Language Requirement: ${targetLang}. 
        Create a viral YouTube Short plan. Output must be raw JSON.
        - title: must be in ${targetLang}.
        - description: must be in ${targetLang}.
        - visual_prompt: English only.`,
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
      const metadata = JSON.parse(promptRes.text || '{}');
      return res.status(200).json({ success: true, metadata });
    }

    if (stage === 'full_flow') {
      await updateStatus(10, "🚀 啟動 Onyx 自動化流程...");
      
      // 1. Analyze
      await updateStatus(20, "🔍 分析趨勢中...");
      const lang = channel.language || 'zh-TW';
      const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Niche: ${channel.niche}. Lang: ${targetLang}. Viral Short plan.`,
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
      const metadata = JSON.parse(promptRes.text || '{}');

      // 2. Render
      await updateStatus(40, "🎬 影片渲染中 (Veo 3.1)...");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: metadata.visual_prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });

      while (!operation.done) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      // 3. Upload
      await updateStatus(90, "🚀 上傳至 YouTube...");
      const boundary = '-------314159265358979323846';
      const metadataPart = JSON.stringify({
        snippet: { title: metadata.title, description: metadata.description + "\n#shorts #ai" },
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

      const uploadData = await uploadRes.json();

      // 4. Finalize & Save History
      await updateStatus(100, "✅ 流程完全完成", 'success');
      
      // 更新發文歷史
      const finalDbRes = await fetch(DB_URL);
      const finalDbData = await finalDbRes.json();
      const finalChannels = Array.isArray(finalDbData) ? finalDbData : Object.values(finalDbData);
      const finalUpdated = finalChannels.map((c: any) => {
        if (c.id === channel.id) {
          const history = c.history || [];
          history.unshift({
            title: metadata.title,
            videoId: uploadData.id,
            url: `https://youtube.com/shorts/${uploadData.id}`,
            publishedAt: new Date().toISOString()
          });
          return { ...c, lastRunTime: Date.now(), history: history.slice(0, 10), step: 0, status: 'idle', lastLog: '待命中' };
        }
        return c;
      });

      await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(finalUpdated) });

      return res.status(200).json({ success: true, videoId: uploadData.id });
    }

    return res.status(400).json({ error: 'Invalid Stage' });
  } catch (e: any) {
    await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
