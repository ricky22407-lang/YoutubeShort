
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  // 注意：Vercel Pro 版 maxDuration 為 300s (5分鐘)。
  // 120s 盲等 + 6 次 30s 輪詢 = 300s。這已達 Serverless 函數極限。
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '10mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) {
      return res.status(200).json({ success: false, error: '遺失 API_KEY' });
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const targetLang = lang === 'en' ? 'English' : 'Traditional Chinese (繁體中文)';
        
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Niche: ${channel.niche}. Output Language: ${targetLang}. 
          Task: Create a viral YouTube Shorts script. 
          Return JSON with "prompt" (English visual desc), "title", and "desc".`,
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
        if (!metadata || !metadata.prompt) throw new Error("缺少 Prompt 資料");

        // 1. 發起生成任務
        let operation;
        try {
          operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: metadata.prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
          });
        } catch (e: any) {
          if (e.message.includes("429")) return res.status(200).json({ success: false, error: "API 配額滿載 (429)", isQuotaError: true });
          throw e;
        }

        /**
         * 經濟效益最佳化輪詢邏輯：
         * - 首段盲等 (Blind Wait): 120s。
         * - 後續輪詢 (Long Gaps): 每 30s 檢查一次。
         */
        console.log("進入 120s 首段盲等期，大幅節省 API 配額消耗...");
        await new Promise(r => setTimeout(r, 120000)); 

        let attempts = 0;
        const POLL_INTERVAL = 30000; // 每 30 秒問一次，平衡響應速度與 RPM
        const MAX_POLL_TIME = 170000; // 約 3 分鐘 (保留 10s 給上傳動作)，總計 290s
        const MAX_ATTEMPTS = Math.floor(MAX_POLL_TIME / POLL_INTERVAL); 

        while (!operation.done && attempts < MAX_ATTEMPTS) {
          try {
            operation = await ai.operations.getVideosOperation({ operation });
            if (!operation.done) {
              console.log(`影片生成中... ${POLL_INTERVAL/1000}s 後進行第 ${attempts + 1} 次查詢`);
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
            }
          } catch (pollErr: any) {
            if (pollErr.message.includes("429")) {
              console.warn("輪詢觸發 429，等待 60s 後重試...");
              await new Promise(r => setTimeout(r, 60000)); 
              continue;
            }
            throw pollErr;
          }
          attempts++;
        }

        if (!operation.done) {
           throw new Error("渲染逾時 (Serverless 5min 限制)。影片可能仍在雲端生成中，請稍後至頻道檢查。");
        }

        // 2. 獲取並下載影片
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        // 3. YouTube 上傳流程
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
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
