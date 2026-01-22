
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, 
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API Key' });

  // 接收新增的 customOutfit 與 customHair
  const { character, vibe, customOutfit, customHair } = req.body;
  const images = character?.images || {};
  
  const hasImages = images.front || images.fullBody || images.side || character.baseImage;
  if (!hasImages) {
    return res.status(400).json({ error: 'Missing Reference Images' });
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
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

    // 1. 智慧參考圖邏輯 (Smart Reference Logic)
    // 如果有指定新服裝 (customOutfit)，我們 *故意* 不傳入全身圖 (fullBody)。
    // 因為全身圖通常包含舊衣服，Veo 會感到困惑。
    // 我們只保留「正面臉部」和「側面結構」，讓 Prompt 決定新衣服。
    
    if (images.front) referenceImages.push(processImage(images.front));
    
    if (customOutfit && customOutfit.trim() !== '') {
      console.log("Custom Outfit detected: Skipping Full Body reference image to avoid conflict.");
    } else {
      // 只有在沒有換裝時，才使用全身參考圖
      if (images.fullBody) referenceImages.push(processImage(images.fullBody));
    }
    
    if (images.side) referenceImages.push(processImage(images.side));
    
    // Fallback for legacy data
    if (referenceImages.length === 0 && character.baseImage) {
        referenceImages.push(processImage(character.baseImage));
    }

    const validRefs = referenceImages.filter(Boolean).slice(0, 3);

    // 2. 建構高擬真 Prompt (High-Fidelity Prompt)
    
    // 構建外觀描述：如果有覆寫就用覆寫的，否則用原本的
    const appearancePrompt = customOutfit || customHair 
      ? `Character is wearing ${customOutfit || 'original outfit'}, with ${customHair || 'original hair'} hairstyle.`
      : character.description;

    const fullPrompt = `
      (Vertical 9:16 Aspect Ratio) Cinematic portrait video of ${appearancePrompt}.
      
      ACTION & VIBE: ${vibe.prompt}
      
      REALISM & TEXTURE (MANDATORY):
      Shot on Arri Alexa Mini LF, 35mm prime lens, f/1.8 aperture.
      Visible skin texture, pores, subsurface scattering (SSS) on skin.
      Film grain, raw footage, chromatic aberration, soft volumetric lighting.
      No plastic skin, no smooth AI look. Imperfect, realistic.
      
      EXPRESSIONS:
      Natural micro-movements, slight breathing, blinking eyes, relaxed lips.
      Character feels alive and present.
      
      COMPOSITION:
      Subject perfectly centered, vertical framing. High fidelity.
    `;

    console.log(`Starting Veo generation for ${character.name} with ${validRefs.length} refs. Override: ${!!customOutfit}`);

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: fullPrompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16',
        referenceImages: validRefs as any
      }
    });

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
