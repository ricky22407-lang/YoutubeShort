
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300,
  api: { bodyParser: { sizeLimit: '15mb' } } 
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { stage, channel, metadata } = req.body;
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) return res.status(200).json({ success: false, error: 'System API_KEY Missing' });

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    switch (stage) {
      case 'analyze': {
        const lang = channel.language || 'zh-TW';
        const rawNiches = channel.niche || 'General Content';
        
        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `核心利基群組: ${rawNiches}. 
          指定輸出語言: ${lang === 'zh-TW' ? '繁體中文 (Traditional Chinese)' : 'English (US)'}.
          
          任務：進行深度市場分析並創作具備「高續看率」潛力的 Shorts 企劃。
          
          【1. 病毒式策略分析】：
          - 找出該利基中最具「視覺爽感」或「情緒共鳴」的切入點。
          - 設計一個「黃金 2 秒鉤子」：影片開頭必須有即時的視覺衝擊或強烈懸念。
          
          【2. SEO 矩陣優化】：
          - 標題需包含 1 個核心高流量關鍵字，並結合點擊誘餌（Clickbait）技巧。
          - 描述需包含精準的 SEO 長尾詞，幫助演算法定位受眾。
          
          【3. Veo 視覺指令規範】：
          - 視覺描述需強調：強烈光影對比、動態構圖、特寫鏡頭。
          - 嚴禁靜態、平淡的畫面。
          
          【嚴格限制】：標題與敘述絕對禁止出現 #AI, #Bot, #ShortsPilot。
          
          請回傳 JSON：{ "prompt": "視覺衝擊指令", "title": "SEO 優化標題", "desc": "人性化敘述+SEO標籤" }`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING, description: "給影片生成器的視覺描述，需包含黃金2秒的動作細節" },
                title: { type: Type.STRING, description: "包含SEO關鍵字的病毒式標題" },
                desc: { type: Type.STRING, description: "包含利基相關標籤與SEO描述內容" }
              },
              required: ["prompt", "title", "desc"]
            }
          }
        });
        return res.status(200).json({ success: true, metadata: JSON.parse(promptRes.text || '{}') });
      }

      case 'render_and_upload': {
        if (!channel.auth?.access_token) throw new Error("YouTube 授權遺失。");

        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 25) {
          await new Promise(r => setTimeout(r, 20000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) throw new Error("影片渲染逾時。");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        
        const boundary = '-------PIPELINE_ONYX_V8_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { 
            title: metadata.title, 
            description: metadata.desc, 
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
            'Content-Length': multipartBody.length.toString()
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(`YouTube API: ${uploadData.error.message}`);
        
        return res.status(200).json({ success: true, videoId: uploadData.id });
      }

      default:
        return res.status(400).json({ error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
