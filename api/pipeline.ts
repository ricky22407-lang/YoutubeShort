
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

  try {
    if (stage === 'full_flow') {
      console.log(`[Pipeline] Headless Flow Started: ${channel.name}`);
      
      const host = req.headers.host || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      
      // 1. Analyze
      const analyzeRes = await fetch(`${protocol}://${host}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) throw new Error(analyzeData.error);
      
      // 2. Render and Upload
      const renderRes = await fetch(`${protocol}://${host}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata: analyzeData.metadata })
      });
      const final = await renderRes.json();

      if (final.success) {
        // 更新資料庫中的紀錄
        const currentRes = await fetch(DB_URL);
        const allData = await currentRes.json();
        
        const updated = (Array.isArray(allData) ? allData : Object.values(allData)).map((c: any) => {
          if (c.id === channel.id) {
            const history = c.history || [];
            // 將新紀錄插入最前方，只保留最近 10 筆
            history.unshift({
              title: analyzeData.metadata.title,
              videoId: final.videoId,
              url: `https://youtube.com/shorts/${final.videoId}`,
              publishedAt: new Date().toISOString()
            });
            
            return { 
              ...c, 
              lastRunTime: Date.now(), 
              lastLog: `✅ 已發布: ${analyzeData.metadata.title}`,
              history: history.slice(0, 10) 
            };
          }
          return c;
        });
        
        await fetch(DB_URL, { 
          method: 'PUT', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated) 
        });
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
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: inputMetadata.visual_prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        while (!operation.done) {
          await new Promise(r => setTimeout(r, 12000));
          operation = await ai.operations.getVideosOperation({ operation });
        }

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
    return res.status(200).json({ success: false, error: e.message });
  }
}
