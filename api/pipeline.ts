
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, 
};

// 輔助：清理 JSON 字串
function cleanJson(text: string): string {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// 新增：刷新 Access Token
async function refreshAccessToken(refreshToken: string) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(`Token 刷新失敗: ${data.error_description || data.error}`);
  return data; // 包含新的 access_token
}

// 輕量化 YouTube 搜尋工具
async function getTrends(niche: string, region: string, apiKey: string) {
  const fetchTrack = async (q: string) => {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=short&maxResults=5&order=viewCount&key=${apiKey}&regionCode=${region || 'TW'}`;
      const res = await fetch(searchUrl);
      const data = await res.json();
      
      if (data.error) return [];
      
      const videoIds = (data.items || []).map((i: any) => i.id.videoId).join(',');
      if (!videoIds) return [];

      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
      const statsRes = await fetch(statsUrl);
      const statsData = await statsRes.json();

      return (statsData.items || []).map((v: any) => ({
        title: v.snippet.title,
        view_count: parseInt(v.statistics.viewCount || '0', 10),
        tags: v.snippet.tags || []
      }));
    } catch (e) {
      return [];
    }
  };

  const [nicheTrends, globalTrends] = await Promise.all([
    fetchTrack(`#shorts ${niche}`),
    fetchTrack(`#shorts trending`)
  ]);

  return { nicheTrends, globalTrends };
}

async function generateWithFallback(ai: any, params: any) {
  const models = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'];
  let lastError = null;

  for (const modelName of models) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model: modelName
      });
      return { text: response.text, modelUsed: modelName };
    } catch (e: any) {
      lastError = e;
      continue;
    }
  }
  throw lastError || new Error("AI Analysis Offline");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      return res.status(200).json({ success: false, error: 'System API_KEY Missing' });
    }

    const { stage, channel, metadata } = req.body;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'analyze': {
        const trends = await getTrends(channel.niche, channel.regionCode, API_KEY);
        
        // 強制語言邏輯
        const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (zh-TW)';
        const langConstraint = channel.language === 'en' 
          ? "CRITICAL: The fields 'title' and 'desc' MUST be written in ENGLISH." 
          : "重要：'title' 與 'desc' 欄位必須使用 繁體中文 (zh-TW)。";

        const analysisParams = {
          contents: `Target Niche: ${channel.niche}. 
          Current Trends Data: ${JSON.stringify(trends)}.
          
          TASK: Create a viral strategy for a YouTube Shorts channel.
          Output Language: ${targetLang}.
          ${langConstraint}
          
          Note: Maintain the aesthetic essence of the ${channel.niche} niche while leveraging viral patterns.
          
          Return JSON: { "prompt": "visual description for video gen", "title": "viral title", "desc": "optimized description with hashtags", "strategy_note": "explanation" }.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING },
                title: { type: Type.STRING },
                desc: { type: Type.STRING },
                strategy_note: { type: Type.STRING }
              },
              required: ["prompt", "title", "desc", "strategy_note"]
            }
          }
        };

        const result = await generateWithFallback(ai, analysisParams);
        return res.status(200).json({ success: true, metadata: JSON.parse(cleanJson(result.text)) });
      }

      case 'render_and_upload': {
        let currentAccessToken = channel.auth?.access_token;
        let newTokens = null;

        // 1. 影片渲染 (Veo)
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 50) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
          if ((operation as any).error) throw new Error(`Veo Error: ${(operation as any).error.message}`);
          attempts++;
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("影片下載連結獲取失敗");

        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

        // 2. YouTube 授權預檢與自動刷新
        const checkRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', {
          headers: { 'Authorization': `Bearer ${currentAccessToken}` }
        });

        if (checkRes.status === 401 && channel.auth?.refresh_token) {
          console.log("Token expired, attempting refresh...");
          const refreshed = await refreshAccessToken(channel.auth.refresh_token);
          currentAccessToken = refreshed.access_token;
          newTokens = { ...channel.auth, ...refreshed };
        } else if (checkRes.status === 401) {
          throw new Error("授權過期且無法自動刷新，請重新點擊 LINK_YT 連結帳號。");
        }

        // 3. 上傳影片
        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { title: metadata.title, description: metadata.desc, categoryId: "22" },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
        });
        
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonMetadata}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentAccessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(`YouTube 上傳錯誤: ${uploadData.error.message}`);
        
        return res.status(200).json({ 
          success: true, 
          videoId: uploadData.id,
          updatedAuth: newTokens 
        });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: `伺服器處理失敗: ${e.message}` });
  }
}
