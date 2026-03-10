import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';
import { ScriptGenerator } from '../modules/ScriptGenerator.js';
import { VideoAssembler } from '../modules/VideoAssembler.js';
import { HeyGenService } from '../modules/HeyGenService.js';
import { searchVideos } from '../services/pexelsService.js';
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
        
        const heygenIdInput = (channel.mptConfig?.heygenAvatarId || '').trim();
        let finalAvatarIds: string[] = [];

        if (!heygenIdInput) return res.status(200).json({ success: false, error: '未提供 HeyGen Avatar ID 或 Group ID' });

        if (heygenIdInput.includes(',')) {
            finalAvatarIds = heygenIdInput.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        } else {
            const groupLooks = await heyGen.getAvatarGroupLooks(heygenIdInput);
            if (groupLooks.length > 0) finalAvatarIds = groupLooks;
            else finalAvatarIds = [heygenIdInput];
        }
        
        const selectedAvatarId = finalAvatarIds[Math.floor(Math.random() * finalAvatarIds.length)];
        const scale = channel.mptConfig?.avatarScale || 1.0;
        const videoId = await heyGen.submitVideoTask(fullText, selectedAvatarId, voiceId, scale);
        
        return res.status(200).json({ success: true, videoId });
      }

      case 'heygen_status': {
        const heyGen = new HeyGenService();
        const result = await heyGen.checkVideoStatus(req.body.videoId);
        return res.status(200).json({ success: true, status: result.status, videoUrl: result.url });
      }

      // 🚀 前端微服務：單幕畫面生成器，徹底避開 Vercel 300秒限制
      case 'generate_single_video': {
        const { visualCue, isFirstSceneWithProduct, useStockFootage, videoEngine, referenceImage } = req.body;
        let finalUrl = '';
        const tryPexels = useStockFootage && !isFirstSceneWithProduct;
        let pexelsSuccess = false;
        
        if (tryPexels && PEXELS_API_KEY) {
            const videoUrls = await searchVideos(visualCue, PEXELS_API_KEY);
            if (videoUrls.length > 0) {
                finalUrl = videoUrls[0];
                pexelsSuccess = true;
                console.log(`[API] 場景採用 Pexels 素材`);
            }
        }
        
        if (!pexelsSuccess) {
            console.log(`[API] 獨立生成 AI 場景 (引擎: ${videoEngine})...`);
            if (videoEngine === 'veo') {
                let imageInput = undefined;
                if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) {
                    const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
                    if (match) imageInput = { mimeType: match[1], imageBytes: match[2] };
                }
                
                let operation = await ai.models.generateVideos({
                    model: 'veo-3.1-fast-generate-preview',
                    prompt: visualCue,
                    image: imageInput,
                    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
                });

                let attempts = 0;
                while (!operation.done && attempts < 30) { 
                    await new Promise(r => setTimeout(r, 5000));
                    operation = await ai.operations.getVideosOperation({ operation });
                    attempts++;
                }

                if (!operation.done || !operation.response?.generatedVideos?.[0]?.video?.uri) {
                    return res.status(500).json({ success: false, error: "AI 生成超時" });
                }
                
                const videoUri = operation.response.generatedVideos[0].video.uri;
                finalUrl = `${videoUri}&key=${API_KEY}`;
            } else {
                finalUrl = 'mock'; 
            }
        }
        
        return res.status(200).json({ success: true, videoUrl: finalUrl });
      }

      case 'suggest_topics': {
        const prompt = `Generate 5 viral YouTube Shorts topic ideas for this channel.\nChannel Niche: ${channel.niche}\nChannel Concept: ${channel.concept || 'General'}\nTarget Audience: ${channel.language === 'en' ? 'Global' : 'Taiwan/Hong Kong (Traditional Chinese)'}\nOutput ONLY a JSON array of strings. Example: ["Topic 1", "Topic 2"]`;
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } }
            });
            return res.status(200).json({ success: true, topics: JSON.parse(cleanJson(response.text || '[]')) });
        } catch (error: any) {
            return res.status(200).json({ success: false, error: error.message });
        }
      }

      case 'generate_script': {
        const generator = new ScriptGenerator(API_KEY);
        const targetDuration = req.body.targetDuration || '60';
        const durationPrompt = targetDuration === '30' ? "\n【極重要】腳本總時長必須嚴格控制在 30 秒以內！總字數請限制在 80~100 字左右，節奏要極快。" : "\n【極重要】腳本總時長必須嚴格控制在 60 秒以內！總字數請限制在 150~180 字左右。";
        const topicToUse = (req.body.topic || channel.niche) + durationPrompt;
        const script = await generator.generate(topicToUse, channel.language || 'zh-TW', req.body.referenceImage);
        return res.status(200).json({ success: true, script });
      }

      case 'render_mpt': {
        const useStockFootage = channel.mptConfig?.useStockFootage ?? true;
        if (useStockFootage && !PEXELS_API_KEY) return res.status(200).json({ success: false, error: 'PEXELS_API_KEY Missing' });
        
        const effectivePexelsKey = useStockFootage ? PEXELS_API_KEY! : 'DISABLED';
        const assembler = new VideoAssembler(API_KEY, effectivePexelsKey);
        const outputFilename = path.join(os.tmpdir(), `mpt_${Date.now()}.mp4`);
        
        try {
            if (previousVideoUrl && previousVideoUrl.includes('blob.vercel-storage.com')) {
                try { await del(previousVideoUrl); } catch (e) {}
            }
            // 🚀 核心更新：將前端收集到的「單幕影片網址陣列 (preGeneratedSceneUrls)」傳入組裝器
            await assembler.assemble(scriptData, outputFilename, channel.mptConfig, channel.characterProfile, req.body.preGeneratedHeygenUrl, req.body.preGeneratedSceneUrls);
            const videoBuffer = fs.readFileSync(outputFilename);
            const blob = await put(`previews/mpt_${Date.now()}.mp4`, videoBuffer, { access: 'public' });
            return res.status(200).json({ success: true, videoUrl: blob.url });
        } catch (e: any) {
            return res.status(200).json({ success: false, error: `Assembly Failed: ${e.message}` });
        }
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) {
    return res.status(200).json({ success: false, error: `Server Error: ${e.message}` });
  }
}
