
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

  // 接收 startImage (base64) 用於續寫
  const { character, vibe, customOutfit, customHair, cameraAngle, startImage } = req.body;
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

    // 1. Smart Reference Logic
    const isCloseUp = cameraAngle === 'close_up';
    const isOverride = (customOutfit && customOutfit.trim() !== '');

    if (images.front) referenceImages.push(processImage(images.front));
    
    if (isCloseUp || isOverride) {
      console.log(`Skipping Full Body Ref. Reason: ${isCloseUp ? 'Close-Up Mode' : 'Outfit Override'}`);
    } else {
      if (images.fullBody) referenceImages.push(processImage(images.fullBody));
    }
    
    if (images.side) referenceImages.push(processImage(images.side));
    
    // Fallback
    if (referenceImages.length === 0 && character.baseImage) {
        referenceImages.push(processImage(character.baseImage));
    }

    const validRefs = referenceImages.filter(Boolean).slice(0, 3);

    // 2. Map Camera Angle
    let compositionPrompt = "";
    switch (cameraAngle) {
        case 'close_up':
            compositionPrompt = "Extreme Close-up shot, focusing on the face. Intimate distance. Shallow depth of field.";
            break;
        case 'waist_up':
            compositionPrompt = "Medium Shot (Waist Up). Ideal for vlogging or conversation.";
            break;
        case 'full_body':
        default:
            compositionPrompt = "Wide Full Body Shot. Dynamic stance.";
            break;
    }

    // 3. Construct Prompt
    const appearancePrompt = customOutfit || customHair 
      ? `Character is wearing ${customOutfit || 'original outfit'}, with ${customHair || 'original hair'} hairstyle.`
      : character.description;

    const fullPrompt = `
      (Vertical 9:16 Aspect Ratio) Cinematic video of ${appearancePrompt}.
      
      ACTION: ${vibe.prompt}
      
      COMPOSITION & ANGLE:
      ${compositionPrompt}
      Subject is perfectly centered vertically.
      
      REALISM:
      Shot on Arri Alexa Mini LF, 35mm prime lens.
      Visible skin texture, pores.
      
      ${startImage ? "CONTINUATION: This video continues from the provided start image. Maintain continuity." : ""}
    `;

    console.log(`Veo Request: [${cameraAngle}] ${vibe.prompt.substring(0, 50)}... Extension: ${!!startImage}`);

    // 4. Config Veo
    // 如果有 startImage，我們使用 Image-to-Video 模式
    // 注意：Veo 的 image 參數可以是單純的 image input，不需要包在 referenceImages 裡
    let inputImage = null;
    if (startImage) {
       const data = startImage.split(',')[1];
       const mime = startImage.split(';')[0].split(':')[1] || 'image/png';
       inputImage = { imageBytes: data, mimeType: mime };
    }

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: fullPrompt,
      // 如果有 startImage，傳入 image 參數
      ...(inputImage && { image: inputImage }),
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
