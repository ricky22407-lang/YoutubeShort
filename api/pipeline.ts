
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) {
      return res.status(200).json({ success: false, error: '遺失 API_KEY，請在 Vercel 設定中檢查。' });
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
        
        // 嘗試獲取 YouTube 現有趨勢資料 (非必要，若失敗則由 AI 自行構思)
        let trends = "No real-time data";
        try {
          const q = encodeURIComponent(`#shorts ${channel.niche}`);
          const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=3&order=viewCount&key=${API_KEY}`);
          const searchData = await searchRes.json();
          trends = (searchData.items || []).map((i: any) => i.snippet.title).join("; ");
        } catch (e) { console.warn("YouTube Search API failed, skipping search data."); }

        try {
          const promptRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Trends: ${trends}. Niche: ${channel.niche}. Output Language: ${targetLang}. 
            Task: Create a viral YouTube Shorts script. 
            The "title" and "desc" fields MUST be in ${targetLang}.
            The "prompt" field should be a detailed visual description in English for a video generator.`,
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

          // 修復: 更強壯的 JSON 提取邏輯，解決 Unexpected non-whitespace 錯誤
          const rawText = promptRes.text || '{}';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          const cleanJson = jsonMatch ? jsonMatch[0] : rawText;
          
          return res.status(200).json({ success: true, metadata: JSON.parse(cleanJson) });
        } catch (aiErr: any) {
          if (aiErr.status === 429) throw new Error("API 額度已耗盡 (429 Resource Exhausted)，請稍候重試。");
          throw aiErr;
        }
      }

      case 'render_and_upload': {
        if (!metadata || !metadata.prompt) throw new Error("缺少影音企劃數據 (Metadata)。");

        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 60) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) throw new Error("影片渲染超時。");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        if (!videoRes.ok) throw new Error("無法從伺服器下載生成的影片。");
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        // 執行 YouTube 上傳
        const boundary = '-------PIPELINE_ONYX_BOUNDARY';
        const metadataPart = JSON.stringify({
          snippet: {
            title: metadata.title || "AI Short",
            description: (metadata.desc || "") + "\n\n#AI #Shorts",
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
        if (!uploadData.id) throw new Error(`YouTube 上傳失敗: ${JSON.stringify(uploadData)}`);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("[PIPELINE ERROR]", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
