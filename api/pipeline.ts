import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';
import { ScriptGenerator } from '../modules/ScriptGenerator.js';
import { VideoAssembler } from '../modules/VideoAssembler.js';
import { HeyGenService } from '../modules/HeyGenService.js'; // 👈 這裡補上鑰匙了！
import path from 'path';
import fs from 'fs';
import os from 'os';
import { put, del } from '@vercel/blob';

export const config = {
  maxDuration: 300, 
};

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

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    return res.status(200).end();
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
    }
    
    const API_KEY = process.env.API_KEY;
    const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

    if (!API_KEY) {
      return res.status(200).json({ success: false, error: 'System API_KEY Missing' });
    }

    const { stage, channel, metadata, scriptData, previousVideoUrl } = req.body;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'heygen_submit': {
        const heyGen = new HeyGenService();
        const fullText = scriptData.scenes.map((s: any) => s.narration).join(' ');
        let voiceId = channel.mptConfig?.voiceId || 'zh-TW-HsiaoChenNeural';
        if (channel.mptConfig?.ttsEngine === 'elevenlabs' && channel.mptConfig?.elevenLabsVoiceId) {
            voiceId = channel.mptConfig.elevenLabsVoiceId;
        }
        const videoId = await heyGen.submitVideoTask(fullText, channel.mptConfig?.heygenAvatarId, voiceId);
        return res.status(200).json({ success: true, videoId });
      }

      case 'heygen_status': {
        const heyGen = new HeyGenService();
        const result = await heyGen.checkVideoStatus(req.body.videoId);
        return res.status(200).json({ success: true, status: result.status, videoUrl: result.url });
      }

      case 'suggest_topics': {
        const prompt = `
            Generate 5 viral YouTube Shorts topic ideas for this channel.
            Channel Niche: ${channel.niche}
            Channel Concept: ${channel.concept || 'General'}
            Target Audience: ${channel.language === 'en' ? 'Global' : 'Taiwan/Hong Kong (Traditional Chinese)'}
            Output ONLY a JSON array of strings. Example: ["Topic 1", "Topic 2"]
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        });
        
        const topics = JSON.parse(cleanJson(response.text || '[]'));
        return res.status(200).json({ success: true, topics });
      }

      case 'generate_script': {
        const generator = new ScriptGenerator(API_KEY);
        const topicToUse = req.body.topic || channel.niche;
        const referenceImage = req.body.referenceImage; 
        const script = await generator.generate(topicToUse, channel.language || 'zh-TW', referenceImage);
        return res.status(200).json({ success: true, script });
      }

      case 'render_mpt': {
        const useStockFootage = channel.mptConfig?.useStockFootage ?? true;
        
        if (useStockFootage && !PEXELS_API_KEY) {
           return res.status(200).json({ success: false, error: 'PEXELS_API_KEY Missing' });
        }
        
        const effectivePexelsKey = useStockFootage ? PEXELS_API_KEY! : 'DISABLED';
        const assembler = new VideoAssembler(API_KEY, effectivePexelsKey);
        const outputFilename = path.join(os.tmpdir(), `mpt_${Date.now()}.mp4`);
        
        try {
            if (previousVideoUrl && previousVideoUrl.includes('blob.vercel-storage.com')) {
                try {
                    await del(previousVideoUrl);
                    console.log("已刪除雲端舊影片:", previousVideoUrl);
                } catch (delError) {
                    console.warn("舊影片刪除失敗 (可能已不存在)");
                }
            }

            // 唯一正確的 assemble 呼叫
            await assembler.assemble(scriptData, outputFilename, channel.mptConfig, channel.characterProfile, req.body.preGeneratedHeygenUrl);
            
            const videoBuffer = fs.readFileSync(outputFilename);
            const blob = await put(`previews/mpt_${Date.now()}.mp4`, videoBuffer, { access: 'public' });
            return res.status(200).json({ success: true, videoUrl: blob.url });
        } catch (e: any) {
            console.error("Assembly Failed:", e);
            return res.status(200).json({ success: false, error: `Assembly Failed: ${e.message}` });
        }
      }

      case 'analyze': {
        let promptContext = "";
        let visualStyleOverride = "";
        
        if (channel.mode === 'character' && channel.characterProfile) {
           promptContext = `
             === AGENT MODE ACTIVE ===
             You are acting as the AI Virtual Idol "${channel.characterProfile.name}".
             Persona: ${channel.characterProfile.description}.
           `;
           visualStyleOverride = "Visual Style: Shot on iPhone 15 Pro, vertical vlog format.";
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
          ${visualStyleOverride}
          Return JSON: { "prompt": "The detailed Veo prompt", "title": "Viral Title", "desc": "Description", "strategy_note": "Why this video?" }.`,
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
            model: 'gemini-3.1-pro-preview',
            ...analysisParams
        });
        
        const resultText = response.text || '';
        return res.status(200).json({ success: true, metadata: JSON.parse(cleanJson(resultText)) });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: `Server Error: ${e.message}` });
  }
}