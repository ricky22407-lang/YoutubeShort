
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

    // ★★★ 關鍵修改：優先處理三視圖 (Three View Chart)
    // 這是 Veo 保持角色一致性最強的輸入
    if (images.threeView) {
        const ref = processImage(images.threeView);
        if (ref) {
            console.log("Using Three-View Chart as Primary Reference");
            referenceImages.push(ref);
        }
    }

    // 只有在沒有三視圖，或者需要補充細節時才加入其他圖片
    // Veo 建議 Reference 不要超過 3 張，且品質要高
    if (referenceImages.length < 3 && images.front) referenceImages.push(processImage(images.front));
    if (referenceImages.length < 3 && images.fullBody) referenceImages.push(processImage(images.fullBody));
    
    // 如果連一張圖都沒有
    if (referenceImages.length === 0) {
         return res.status(400).json({ error: 'Missing Reference Images (Please upload a 3-View Chart or Front photo)' });
    }

    const validRefs = referenceImages.filter(Boolean).slice(0, 3);

    // Prompt Construction (Same as before)
    let compositionPrompt = "";
    switch (cameraAngle) {
        case 'close_up': compositionPrompt = "Extreme Close-up shot, focusing on face."; break;
        case 'waist_up': compositionPrompt = "Medium Shot (Waist Up)."; break;
        case 'full_body': default: compositionPrompt = "Wide Full Body Shot."; break;
    }

    const appearancePrompt = customOutfit || customHair 
      ? `Character is wearing ${customOutfit || 'original outfit'}, with ${customHair || 'original hair'} hairstyle.`
      : character.description; // 使用視覺總結

    const fullPrompt = `
      (Vertical 9:16) Cinematic video of ${appearancePrompt}.
      
      ACTION: ${vibe.prompt}
      
      COMPOSITION: ${compositionPrompt}
      
      REALISM:
      Shot on Arri Alexa. Visible skin texture. 
      Consistent character features based on provided reference images.
      
      ${startImage ? "CONTINUATION: Match previous frame exactly." : ""}
    `;

    console.log(`Veo Request with ${validRefs.length} refs.`);

    let inputImage = null;
    if (startImage) {
       const data = startImage.split(',')[1];
       const mime = startImage.split(';')[0].split(':')[1] || 'image/png';
       inputImage = { imageBytes: data, mimeType: mime };
    }

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: fullPrompt,
      ...(inputImage && { image: inputImage }),
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16',
        referenceImages: validRefs as any
      }
    });

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
