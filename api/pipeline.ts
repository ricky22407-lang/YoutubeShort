
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    switch (stage) {
      case 'suggest_schedule': {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `身為 YouTube 短影音專家，針對主題「${channel.niche}」，分析全球觀眾觀看大數據，提供最佳上片建議。
          請產出 JSON：
          {
            "days": [1, 3, 5], // 0-6 代表週日至週六
            "time": "18:30",
            "count": 1,
            "reason": "為什麼這個時間最好？"
          }`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                days: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                time: { type: Type.STRING },
                count: { type: Type.INTEGER },
                reason: { type: Type.STRING }
              },
              required: ["days", "time", "count", "reason"]
            }
          }
        });
        return res.status(200).json({ success: true, suggestion: JSON.parse(response.text || '{}') });
      }

      case 'analyze': {
        const langName = channel.language === 'en' ? 'English' : '繁體中文';
        const q = encodeURIComponent(`#shorts ${channel.niche}`);
        const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=5&order=viewCount&key=${process.env.API_KEY}`);
        const searchData = await searchRes.json();
        const trends = (searchData.items || []).map((i: any) => i.snippet.title).join("; ");

        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `趨勢：${trends}。主題：${channel.niche}。語言：${langName}。產出爆款企劃 JSON，標題描述要口語自然。`,
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
          prompt: metadata.prompt,
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
            title: metadata.title || "New Short",
            description: metadata.desc || "",
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
