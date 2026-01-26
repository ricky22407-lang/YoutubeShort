
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import { Buffer } from 'buffer';

export const config = {
  maxDuration: 300, 
  api: { bodyParser: { sizeLimit: '20mb' } },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Missing API Key' });

  const { character, vibe, customOutfit, customHair, cameraAngle, startImage } = req.body;
  const images = character?.images || {};
  
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    // 1. 準備 Reference Images (僅在非續寫模式下使用)
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
      } catch (e) { return null; }
    };

    if (!startImage) {
        // 優先順序：三視圖 > 正面 > 全身 > 側面 > 背面
        if (images.threeView) referenceImages.push(processImage(images.threeView));
        if (images.front) referenceImages.push(processImage(images.front));
        if (images.fullBody) referenceImages.push(processImage(images.fullBody));
        
        // 新增支援側面與背面，補足 3 張的額度
        if (referenceImages.length < 3 && images.side) referenceImages.push(processImage(images.side));
        if (referenceImages.length < 3 && images.back) referenceImages.push(processImage(images.back));
        
        // 確保沒有 Null
        const validRefs = referenceImages.filter(Boolean).slice(0, 3);
        
        // 如果沒有起始圖，也沒有參考圖，就報錯
        if (validRefs.length === 0) {
             return res.status(400).json({ error: 'Missing Reference Images (Please upload a 3-View Chart or Front photo)' });
        }
    }

    // 2. 構建 Prompt (強化服裝權重)
    let compositionPrompt = "";
    switch (cameraAngle) {
        case 'close_up': compositionPrompt = "Extreme Close-up shot, focusing on face expression."; break;
        case 'waist_up': compositionPrompt = "Medium Shot (Waist Up), focusing on upper body action."; break;
        case 'full_body': default: compositionPrompt = "Wide Full Body Shot, showing entire outfit and environment."; break;
    }

    // 邏輯修正：如果指定了服裝，我們必須明確告訴模型「忽略參考圖的服裝，改穿這個」
    // 使用 "Subject Description" + "Explicit Attire" 的結構
    const baseIdentity = character.description || "A virtual character";
    
    let attirePrompt = "";
    if (customOutfit) {
        attirePrompt = `CRITICAL OUTFIT OVERRIDE: The character is wearing ${customOutfit}. Ignore the outfit in reference images.`;
    }
    
    let hairPrompt = "";
    if (customHair) {
        hairPrompt = `HAIRSTYLE: ${customHair}.`;
    }

    const fullPrompt = `
      (Vertical 9:16) Cinematic video.
      
      SUBJECT IDENTITY: ${baseIdentity}.
      ${attirePrompt}
      ${hairPrompt}
      
      ACTION: ${vibe.prompt}
      
      COMPOSITION: ${compositionPrompt}
      
      REALISM:
      Shot on Arri Alexa. Visible skin texture. High fidelity.
      ${startImage ? "CONTINUATION: Seamlessly continue the motion from the input image." : "Consistent facial features based on provided reference images, but allowing outfit changes as described."}
    `;

    // 3. 執行生成 (分流處理以避免衝突)
    let operation;
    
    if (startImage) {
        console.log("Mode: Image-to-Video Continuation (Ignoring Refs to prevent conflict)");
        const data = startImage.split(',')[1];
        const mime = startImage.split(';')[0].split(':')[1] || 'image/png';
        
        operation = await ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: fullPrompt,
          image: { imageBytes: data, mimeType: mime },
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '9:16',
            // 注意：續寫模式下不傳送 referenceImages，避免 400 錯誤
          }
        });
    } else {
        console.log(`Mode: Character Reference Generation (${referenceImages.filter(Boolean).length} refs)`);
        const validRefs = referenceImages.filter(Boolean).slice(0, 3);
        
        operation = await ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: fullPrompt,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '9:16',
            referenceImages: validRefs as any
          }
        });
    }

    // Polling logic...
    let attempts = 0;
    while (!operation.done && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    if (!operation.done) throw new Error("Veo Generation Timed Out");

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
    const videoBuffer = await videoRes.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString('base64');

    return res.status(200).json({ success: true, videoUrl: `data:video/mp4;base64,${videoBase64}` });

  } catch (e: any) {
    console.error("Character Pipeline Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
