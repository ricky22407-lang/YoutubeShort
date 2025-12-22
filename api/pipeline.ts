
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '25mb' } } // 提高限制以容納影片二進位數據
};

// YouTube REST 通訊輔助函數
async function ytCall(path: string, auth: any, options: any = {}) {
  const url = `https://www.googleapis.com/youtube/v3/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`YouTube API Error: ${res.status} - ${txt}`);
  }
  return res.json();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata, videoAsset } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        // 1. 搜尋真實趨勢
        const q = encodeURIComponent(`#shorts ${channel.niche}`);
        const search = await ytCall(`search?part=snippet&q=${q}&type=video&maxResults=5&order=viewCount`, channel.auth);
        const trends = search.items.map((i: any) => i.snippet.title).join("; ");

        // 2. AI 企劃
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `基於趨勢「${trends}」，為「${channel.niche}」規劃一則爆款 9:16 短片。`,
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

      case 'render': {
        // 3. Veo 3.1 影像生成
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
        const buffer = await videoRes.arrayBuffer();
        
        // 返回 Base64 給前端顯示/傳輸到下一階段
        return res.status(200).json({ 
          success: true, 
          base64: Buffer.from(buffer).toString('base64'),
          title: metadata.title,
          desc: metadata.desc
        });
      }

      case 'upload': {
        // 4. 真實發布：YouTube REST Multipart Upload
        if (!videoAsset || !videoAsset.base64) throw new Error("缺少影片數據。");
        
        const videoBuffer = Buffer.from(videoAsset.base64, 'base64');
        const boundary = '-------314159265358979323846';
        const metadataPart = JSON.stringify({
          snippet: {
            title: videoAsset.title || "AI Generated Short",
            description: (videoAsset.desc || "") + "\n\n#shorts #ai #automation",
            categoryId: "22" // People & Blogs
          },
          status: {
            privacyStatus: "public", // 直接設為公開，方便檢查
            selfDeclaredMadeForKids: false
          }
        });

        // 構建 Multipart Body
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
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': multipartBody.length.toString()
          },
          body: multipartBody
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          throw new Error(`YouTube 上傳失敗: ${uploadRes.status} - ${err}`);
        }

        const uploadData = await uploadRes.json();
        return res.status(200).json({ 
          success: true, 
          videoId: uploadData.id,
          url: `https://youtube.com/shorts/${uploadData.id}` 
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("Pipeline Error:", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
