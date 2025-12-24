
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';
import { TrendSearcher } from '../modules/TrendSearcher';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '15mb' } } 
};

async function generateWithFallback(ai: any, params: any) {
  const models = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'];
  let lastError = null;

  for (const modelName of models) {
    try {
      console.log(`[Pipeline] Analysis Level: ${modelName}`);
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return res.status(200).json({ success: false, error: 'System API_KEY Missing' });

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const searcher = new TrendSearcher();
        const trends = await searcher.execute(channel);

        const analysisParams = {
          contents: `
          利基領域: ${channel.niche}.
          語系: ${channel.language === 'en' ? 'English' : '繁體中文'}.
          
          【趨勢數據注入】：
          1. 垂直利基趨勢 (你的同業): ${JSON.stringify(trends.nicheTrends)}
          2. 全域病毒趨勢 (目前演算法最愛的節奏): ${JSON.stringify(trends.globalTrends)}
          
          【任務】：
          分析以上數據，找出全域趨勢中的「高留存視覺特徵」（如：特定色彩、鏡頭運動、光影節奏），並將其應用在你的「利基領域」中。
          
          【視覺提示詞規範】：
          1. 必須符合 Hook (0-2s) / Body / Loop 結構。
          2. 使用高級攝影術語提升 Veo 產出品質（如：Global Illumination, Ray-traced reflections, Dynamic Tracking Shot）。
          3. 確保開頭具備極強的視覺衝突。
          
          請回傳 JSON。`,
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
        return res.status(200).json({ 
          success: true, 
          metadata: JSON.parse(result.text || '{}'),
          modelUsed: result.modelUsed 
        });
      }

      case 'render_and_upload': {
        if (!channel.auth?.access_token) throw new Error("YouTube Auth Lost.");

        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 30) {
          await new Promise(r => setTimeout(r, 20000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
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
            'Authorization': `Bearer ${channel.auth.access_token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
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
