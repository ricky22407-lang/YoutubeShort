
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, 
  api: {
    bodyParser: {
      sizeLimit: '20mb', // 增加限制以支援多張圖片
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API Key' });

  const { character, vibe } = req.body;
  const images = character?.images || {};
  
  // 檢查至少有一張圖
  const hasImages = images.front || images.fullBody || images.side || character.baseImage;
  if (!hasImages) {
    return res.status(400).json({ error: 'Missing Reference Images' });
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    // 1. 準備 Reference Images Array
    const referenceImages = [];

    const processImage = (base64Str: string) => {
      if (!base64Str) return null;
      try {
        const data = base64Str.split(',')[1];
        const mime = base64Str.split(';')[0].split(':')[1] || 'image/png';
        return {
          image: { imageBytes: data, mimeType: mime },
          referenceType: VideoGenerationReferenceType.ASSET,
        };
      } catch (e) {
        return null;
      }
    };

    // 優先順序：Front -> Full -> Side
    if (images.front) referenceImages.push(processImage(images.front));
    if (images.fullBody) referenceImages.push(processImage(images.fullBody));
    if (images.side) referenceImages.push(processImage(images.side));
    // 相容舊版
    if (referenceImages.length === 0 && character.baseImage) {
        referenceImages.push(processImage(character.baseImage));
    }

    const validRefs = referenceImages.filter(Boolean).slice(0, 3); // Veo 上限通常為 3-4，保守設 3

    // 2. 建構 Prompt
    const prompt = `(Vertical 9:16 Aspect Ratio) Cinematic video of ${character.description}. 
    Action: ${vibe.prompt}. 
    CRITICAL: Keep the character consistent with the provided reference images. 
    Use the face from the Front view and the outfit/proportions from the Full Body view if provided.
    COMPOSITION: Full body or 3/4 shot, perfectly centered in a vertical 9:16 frame. High quality, detailed texture, 35mm lens.`;

    console.log(`Starting Veo generation for ${character.name} with ${validRefs.length} refs.`);

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16',
        referenceImages: validRefs as any // Type assertion needed sometimes
      }
    });

    // 3. 輪詢
    let attempts = 0;
    while (!operation.done && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    if (!operation.done) {
      throw new Error("Veo Generation Timed Out");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("No video URI returned");

    // 4. 下載並轉發
    const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
    const videoBuffer = await videoRes.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString('base64');
    const dataUrl = `data:video/mp4;base64,${videoBase64}`;

    return res.status(200).json({ 
      success: true, 
      videoUrl: dataUrl 
    });

  } catch (e: any) {
    console.error("Character Pipeline Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}