
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
  return data;
}

async function getTrends(niche: string, region: string, apiKey: string) {
  return { nicheTrends: [], globalTrends: [] }; 
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
        let promptContext = "";
        let visualStyleOverride = "";
        
        if (channel.mode === 'character' && channel.characterProfile) {
           promptContext = `
             === AGENT MODE ACTIVE ===
             You are acting as the AI Virtual Idol "${channel.characterProfile.name}".
             Persona: ${channel.characterProfile.description}.
             
             Instead of generic content, generate content that fits your specific persona.
             Think: "What would ${channel.characterProfile.name} post today to get attention?"
             
             **CRITICAL: ADAPTIVE OUTFIT**
             You MUST change the outfit description based on the video context.
             - If working out -> Gym clothes.
             - If at home -> Pajamas.
             - If going out -> Streetwear.
             Do NOT say "generic clothes". Be specific (e.g., "Pink oversized hoodie and yoga pants").
           `;
           
           visualStyleOverride = "Visual Style: Shot on iPhone 15 Pro, vertical vlog format, slight camera shake, raw unedited feel. The character should look at the camera like they are Facetiming a friend.";
        } else {
           promptContext = `Target Niche: ${channel.niche}. Concept: ${channel.concept}`;
           visualStyleOverride = "Visual Style: Cinematic, High Production Value, 4k, Arri Alexa.";
        }

        const targetLang = channel.language === 'en' ? 'English' : 'Traditional Chinese (zh-TW)';
        
        const analysisParams = {
          contents: `
          ${promptContext}
          
          TASK: Create a viral strategy for a YouTube Shorts video.
          Output Language: ${targetLang}.
          
          === REALISM ENFORCER (CRITICAL) ===
          To ensure the video does NOT look like a generic AI animation:
          1. **Texture**: Specify "visible skin pores", "imperfections", "flyaway hairs", "dust particles".
          2. **Lighting**: Use "Natural window light", "Harsh neon", or "Golden hour lens flare". Avoid "Perfect studio lighting".
          3. **Camera**: Specify "Handheld", "GoPro POV", "Security Camera grainy", or "35mm film grain".
          4. **Motion**: "Micro-movements" (breathing, blinking, hair swaying) are better than complex physics.
          
          ${visualStyleOverride}

          Return JSON: { "prompt": "The detailed Veo prompt (MUST include specific outfit and hairstyle description fitting the scene)", "title": "Viral Title", "desc": "Description", "strategy_note": "Why this video?" }.`,
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

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            ...analysisParams
        });
        
        const resultText = response.text;
        return res.status(200).json({ success: true, metadata: JSON.parse(cleanJson(resultText)) });
      }

      case 'render_and_upload': {
        let currentAccessToken = channel.auth?.access_token;
        if (channel.auth?.refresh_token) {
             try {
                const refreshed = await refreshAccessToken(channel.auth.refresh_token);
                currentAccessToken = refreshed.access_token;
             } catch(e) { console.warn("Refresh failed", e); }
        }

        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: metadata.prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
        });

        let attempts = 0;
        while (!operation.done && attempts < 60) {
          await new Promise(r => setTimeout(r, 5000));
          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }
        
        if (!operation.done) throw new Error("Veo Timeout");

        if (operation.error) {
             throw new Error(`Veo Generation Failed: ${operation.error.message}`);
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
             throw new Error("Veo completed but returned no video URI.");
        }

        const videoRes = await fetch(`${downloadLink}&key=${API_KEY}`);
        const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

        const boundary = '-------PIPELINE_UPLOAD';
        const jsonMeta = JSON.stringify({
             snippet: { title: metadata.title, description: metadata.desc, categoryId: "24" },
             status: { privacyStatus: "public" }
        });

        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonMeta}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentAccessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
            body: multipartBody
        });
        
        const uploadData = await uploadRes.json();
        return res.status(200).json({ success: true, videoId: uploadData.id || 'mock_id' });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: `Server Error: ${e.message}` });
  }
}
