
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
    // 1. 準備 Reference Images
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
        if (images.threeView) referenceImages.push(processImage(images.threeView));
        if (images.front) referenceImages.push(processImage(images.front));
        if (images.fullBody) referenceImages.push(processImage(images.fullBody));
        if (referenceImages.length < 3 && images.side) referenceImages.push(processImage(images.side));
        if (referenceImages.length < 3 && images.back) referenceImages.push(processImage(images.back));
        
        const validRefs = referenceImages.filter(Boolean).slice(0, 3);
        if (validRefs.length === 0) {
             return res.status(400).json({ error: 'Missing Reference Images (Please upload a 3-View Chart or Front photo)' });
        }
    }

    // 2. 構建 Prompt
    let compositionPrompt = "";
    switch (cameraAngle) {
        case 'close_up': compositionPrompt = "Extreme Close-up shot, focusing on face expression."; break;
        case 'waist_up': compositionPrompt = "Medium Shot (Waist Up), focusing on upper body action."; break;
        case 'full_body': default: compositionPrompt = "Wide Full Body Shot, showing entire outfit and environment."; break;
    }

    const baseIdentity = character.description || "A virtual character";
    const age = character.age || "20";
    const gender = character.gender || "Female";
    
    // 物理錨點
    const physicalAnchor = `PHYSICAL ANCHOR: Subject is a ${age}-year-old ${gender}. Maintain mature body proportions and height. DO NOT generate a child or chibi character.`;

    let attirePrompt = "";
    if (customOutfit) {
        attirePrompt = `CRITICAL OUTFIT OVERRIDE: The character is wearing ${customOutfit}, tailored fit for an adult. Ignore the outfit in reference images.`;
    }
    
    let hairPrompt = "";
    if (customHair) {
        hairPrompt = `HAIRSTYLE: ${customHair}.`;
    }

    // ★★★ 關鍵更新：加入禁止字幕的指令 ★★★
    const negativeConstraints = "NO TEXT, NO SUBTITLES, NO WATERMARKS, CLEAN FOOTAGE.";

    const fullPrompt = `
      (Vertical 9:16) Cinematic video. ${negativeConstraints}
      
      SUBJECT IDENTITY: ${baseIdentity}.
      ${physicalAnchor}
      ${attirePrompt}
      ${hairPrompt}
      
      ACTION: ${vibe.prompt}
      
      COMPOSITION: ${compositionPrompt}
      
      REALISM:
      Shot on Arri Alexa. Visible skin texture. High fidelity.
      ${startImage ? "CONTINUATION: Seamlessly continue the motion from the input image." : "Consistent facial features based on provided reference images, but allowing outfit changes as described."}
    `;

    // 3. 執行生成
    let operation;
    
    if (startImage) {
        console.log("Mode: Image-to-Video Continuation");
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
          }
        });
    } else {
        const validRefs = referenceImages.filter(Boolean).slice(0, 3);
        console.log(`Mode: Character Reference Generation (${validRefs.length} refs)`);
        
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

    // Polling logic
    let attempts = 0;
    while (!operation.done && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    // 4. 錯誤檢查
    if (!operation.done) throw new Error("Veo Generation Timed Out");
    
    if (operation.error) {
        console.error("Veo API Error Details:", JSON.stringify(operation.error, null, 2));
        throw new Error(`Veo Generation Failed: ${operation.error.message || 'Unknown Error'}`);
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        console.error("Veo Empty Response:", JSON.stringify(operation, null, 2));
        throw new Error("Veo completed but returned no video URI. This usually means safety filters were triggered.");
    }

    const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
    const videoBuffer = await videoRes.arrayBuffer();
    const videoBase64 = Buffer.from(videoBuffer).toString('base64');

    return res.status(200).json({ success: true, videoUrl: `data:video/mp4;base64,${videoBase64}` });

  } catch (e: any) {
    console.error("Character Pipeline Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
