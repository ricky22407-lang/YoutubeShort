
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
  const DB_URL = `https://${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseio.com/channels.json`;

  try {
    // 如果是全自動流程，我們會連續執行 Analyze -> Render -> Upload
    if (stage === 'full_flow') {
      console.log(`[Pipeline] 開始全自動流程: ${channel.name}`);
      
      // 1. Analyze
      const analyzeRes = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'analyze', channel })
      });
      const { metadata } = await analyzeRes.json();
      
      // 2. Render and Upload
      const renderRes = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'render_and_upload', channel, metadata })
      });
      const final = await renderRes.json();

      // 3. 更新最後運行時間 (重要：防止重複觸發)
      if (final.success) {
        // 先讀取，更新，再存回
        const currentRes = await fetch(DB_URL);
        const all = await currentRes.json();
        // 尋找對應索引並更新
        const updated = Object.values(all).map((c: any) => 
          c.id === channel.id ? { ...c, lastRunTime: Date.now(), lastLog: `✅ 發布成功: ${final.videoId}` } : c
        );
        await fetch(DB_URL, { method: 'PUT', body: JSON.stringify(updated) });
      }

      return res.status(200).json(final);
    }

    // 原始階段處理
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
        
        const q = encodeURIComponent(`#shorts ${channel.niche}`);
        const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=5&order=viewCount&key=${process.env.API_KEY}`);
        const searchData = await searchRes.json();
        const trends = (searchData.items || []).map((i: any) => i.snippet.title).join("; ");

        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Trends: ${trends}. Niche: ${channel.niche}. Output Language: ${targetLang}. 
          Task: Create a viral YouTube Shorts script. 
          The "title" and "desc" fields MUST be in ${targetLang}.
          The "prompt" field should be in English for the video generator.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING },
                title: { type: Type.STRING },
                desc: { type: Type.STRING }
              },
              required: ["prompt", "title", "desc"]
            }
          }
        });
        return res.status(200).json({ success: true, metadata: JSON.parse(promptRes.text || '{}') });
      }

      case 'render_and_upload': {
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: inputMetadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        while (!operation.done) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        const boundary = '-------314159265358979323846';
        const metadataPart = JSON.stringify({
          snippet: {
            title: inputMetadata.title || "New AI Short",
            description: inputMetadata.desc || "",
            categoryId: "22"
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
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
        return res.status(200).json({ success: true, videoId: uploadData.id, url: `https://youtube.com/shorts/${uploadData.id}` });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
