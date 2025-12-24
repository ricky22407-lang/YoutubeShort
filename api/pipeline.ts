
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, // 增加到 5 分鐘上限
};

// 輔助：清理 JSON 字串
function cleanJson(text: string): string {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
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
    // 每次請求重新建立實例以確保金鑰時效性
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'analyze': {
        const trends = await getTrends(channel.niche, channel.regionCode, API_KEY);

        const analysisParams = {
          contents: `
          【角色】：頂尖 YouTube 演算法分析師
          【目標】：將「全域病毒節奏」嫁接到「垂直利基內容」中。
          【利基】: ${channel.niche}
          【垂直利基趨勢】: ${JSON.stringify(trends.nicheTrends)}
          【全域病毒趨勢】: ${JSON.stringify(trends.globalTrends)}
          
          任務：產出 JSON 格式的短影音製作提示詞(prompt)、標題(title)與策略說明(strategy_note)。`,
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
        const cleanedText = cleanJson(result.text || '{}');
        const parsed = JSON.parse(cleanedText);
        
        return res.status(200).json({ 
          success: true, 
          metadata: parsed,
          modelUsed: result.modelUsed 
        });
      }

      case 'render_and_upload': {
        if (!channel.auth?.access_token) throw new Error("YouTube 授權無效，請重新連結。");

        // 啟動 Veo 影片渲染
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        const MAX_ATTEMPTS = 50; // 50 * 10s = 500s (約 8 分鐘)
        
        while (!operation.done && attempts < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 10000));
          operation = await ai.operations.getVideosOperation({ operation });
          
          // 檢查 operation 是否回傳了錯誤
          if ((operation as any).error) {
            throw new Error(`Veo 渲染出錯: ${(operation as any).error.message}`);
          }
          attempts++;
        }

        if (!operation.done) throw new Error("影片渲染逾時 (Veo Task Timeout)");
        
        // 確保 operation.response 存在
        if (!operation.response?.generatedVideos || operation.response.generatedVideos.length === 0) {
          throw new Error("模型已完成但未產出任何影片內容 (Empty response)");
        }

        const downloadLink = operation.response.generatedVideos[0]?.video?.uri;
        if (!downloadLink) {
          throw new Error("無法從模型響應中解析影片下載連結 (Missing video URI)");
        }

        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        if (!videoRes.ok) throw new Error(`影片文件下載失敗: ${videoRes.statusText}`);
        
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        // YouTube 上傳邏輯
        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { 
            title: metadata.title, 
            description: metadata.desc + "\n\n#Shorts #AI #Automation",
            categoryId: "22" 
          },
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
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(`YouTube 上傳錯誤: ${uploadData.error.message}`);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) {
    console.error("[Fatal API Error]:", e.message);
    return res.status(200).json({ 
      success: false, 
      error: `伺服器處理失敗: ${e.message}` 
    });
  }
}
