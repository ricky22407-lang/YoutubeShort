
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata: inputMetadata } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const FIREBASE_ID = process.env.VITE_FIREBASE_PROJECT_ID;
  const DB_URL = `https://${FIREBASE_ID}.firebaseio.com/channels.json`;

  const updateStatus = async (step: number, log: string, status: string = 'running') => {
    try {
      const currentRes = await fetch(DB_URL);
      const allData = await currentRes.json();
      const updated = (Array.isArray(allData) ? allData : Object.values(allData)).map((c: any) => {
        if (c.id === channel.id) {
          return { ...c, step, lastLog: log, status };
        }
        return c;
      });
      await fetch(DB_URL, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated) 
      });
    } catch (e) {
      console.error("Status update failed", e);
    }
  };

  try {
    if (stage === 'full_flow') {
      console.log(`[Pipeline] Headless Flow Started: ${channel.name}`);
      await updateStatus(10, "🚀 啟動自動化流程...", 'running');
      
      const host = req.headers.host || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      
      // 1. Analyze
      await updateStatus(20, "🔍 正在分析趨勢與生成腳本...", 'running');
      const analyzeRes = await fetch(`${protocol}://${host}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) throw new Error(analyzeData.error);
      
      // 2. Render and Upload
      await updateStatus(40, "🎨 腳本已完成，準備進入影片渲染階段...", 'running');
      const renderRes = await fetch(`${protocol}://${host}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: analyzeData.metadata })
      });
      const final = await renderRes.json();

      if (final.success) {
        await updateStatus(100, `✅ 流程完成: ${analyzeData.metadata.title}`, 'success');
        
        // 更新歷史紀錄
        const currentRes = await fetch(DB_URL);
        const allData = await currentRes.json();
        const updated = (Array.isArray(allData) ? allData : Object.values(allData)).map((c: any) => {
          if (c.id === channel.id) {
            const history = c.history || [];
            history.unshift({
              title: analyzeData.metadata.title,
              videoId: final.videoId,
              url: `https://youtube.com/shorts/${final.videoId}`,
              publishedAt: new Date().toISOString()
            });
            return { 
              ...c, 
              lastRunTime: Date.now(), 
              history: history.slice(0, 10),
              step: 0 // 重置進度
            };
          }
          return c;
        });
        await fetch(DB_URL, { 
          method: 'PUT', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated) 
        });
      } else {
        throw new Error(final.error);
      }
      return res.status(200).json(final);
    }

    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
        
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Niche: ${channel.niche}. Language Requirement: ${targetLang}. 
          Create a viral YouTube Short plan.
          - title: must be in ${targetLang}.
          - description: must be in ${targetLang}.
          - visual_prompt: must be in English for the video model.`,
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
        return res.status(200).json({ success: true, metadata: JSON.parse(promptRes.text || '{}') });
      }

      case 'render_and_upload': {
        await updateStatus(50, "🎬 Veo 引擎啟動，正在渲染 9:16 影片 (約需 1-2 分鐘)...");
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: inputMetadata.visual_prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let pollCount = 0;
        while (!operation.done) {
          pollCount++;
          // 模擬平滑進度增加
          const currentStep = Math.min(85, 50 + pollCount * 5);
          await updateStatus(currentStep, "🎬 影片渲染中，請耐心等候...");
          await new Promise(r => setTimeout(r, 12000));
          operation = await ai.operations.getVideosOperation({ operation });
        }

        await updateStatus(90, "🚀 影片渲染完成，正在上傳至 YouTube...");
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        const boundary = '-------314159265358979323846';
        const metadataPart = JSON.stringify({
          snippet: {
            title: inputMetadata.title,
            description: inputMetadata.description + "\n#shorts #ai",
            categoryId: "22"
          },
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
        if (uploadData.error) throw new Error(uploadData.error.message);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("[Pipeline Error]", e.message);
    await updateStatus(0, `❌ 錯誤: ${e.message}`, 'error');
    return res.status(200).json({ success: false, error: e.message });
  }
}
