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

export const config = { maxDuration: 300 };

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
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: `Method Not Allowed` });
    
    const API_KEY = process.env.API_KEY;
    const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

    if (!API_KEY) return res.status(200).json({ success: false, error: 'System API_KEY Missing' });

    const { stage, channel, scriptData, previousVideoUrl } = req.body;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'heygen_submit': {
        const heyGen = new HeyGenService();
        const fullText = scriptData.scenes.map((s: any) => s.narration).join(' ');
        let voiceId = channel.mptConfig?.voiceId || 'zh-TW-HsiaoChenNeural';
        if (channel.mptConfig?.ttsEngine === 'elevenlabs' && channel.mptConfig?.elevenLabsVoiceId) voiceId = channel.mptConfig.elevenLabsVoiceId;
        const heygenIdInput = (channel.mptConfig?.heygenAvatarId || '').trim();
        let finalAvatarIds: string[] = [];
        if (!heygenIdInput) return res.status(200).json({ success: false, error: '未提供 HeyGen Avatar ID' });
        if (heygenIdInput.includes(',')) finalAvatarIds = heygenIdInput.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
        else {
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

      case 'generate_single_video': {
        const { visualCue, isFirstSceneWithProduct, useStockFootage, videoEngine, referenceImage, klingModelVersion } = req.body;
        let finalUrl = '';
        const tryPexels = useStockFootage && !isFirstSceneWithProduct;
        let pexelsSuccess = false;
        
        if (tryPexels && PEXELS_API_KEY) {
            const videoUrls = await searchVideos(visualCue, PEXELS_API_KEY);
            if (videoUrls.length > 0) { finalUrl = videoUrls[0]; pexelsSuccess = true; }
        }
        
        if (!pexelsSuccess) {
            if (videoEngine === 'veo') {
                let imageInput = undefined;
                if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) {
                    const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
                    if (match) imageInput = { mimeType: match[1], imageBytes: match[2] };
                }
                let operation = await ai.models.generateVideos({
                    model: 'veo-2.0-generate-001',
                    prompt: visualCue,
                    image: imageInput,
                    config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' }
                });
                let attempts = 0;
                while (!operation.done && attempts < 30) { 
                    await new Promise(r => setTimeout(r, 5000));
                    operation = await ai.operations.getVideosOperation({ operation });
                    attempts++;
                }
                if (!operation.done || !operation.response?.generatedVideos?.[0]?.video?.uri) return res.status(500).json({ success: false, error: "Veo 生成超時" });
                finalUrl = `${operation.response.generatedVideos[0].video.uri}&key=${API_KEY}`;
            } 
            else if (videoEngine === 'kling') {
                const KIE_API_KEY = process.env.KIE_API_KEY;
                if (!KIE_API_KEY) return res.status(500).json({ success: false, error: "缺少 KIE_API_KEY" });
                
                const selectedKlingModel = klingModelVersion || 'kling-3.0';
                
                // 翻譯成 Kie.ai 看得懂的代號
                let actualModelName = "kling-3.0"; 
                if (selectedKlingModel === 'kling-2.6-pro') {
                    actualModelName = referenceImage ? "kling-2.6/image-to-video" : "kling-2.6/text-to-video";
                } else if (selectedKlingModel === 'kling-2.5-turbo') {
                    actualModelName = referenceImage ? "kling/v2-5-turbo-image-to-video-pro" : "kling/v2-5-turbo-text-to-video-pro";
                }

                // 🚀 封裝給 Kie.ai 的參數 (修正數字格式與雙重圖片參數)
                const kieInput: any = {
                    prompt: visualCue,
                    duration: 5,  // 👈 必須是數字 5，不能加引號
                    aspect_ratio: "9:16"    
                };
                
                if (actualModelName === "kling-3.0/video") {
                    kieInput.mode = "pro";        
                    kieInput.multi_shots = false; 
                    if (referenceImage) kieInput.image_urls = [referenceImage]; 
                } else {
                    if (referenceImage) {
                        kieInput.image_url = referenceImage; 
                        kieInput.image = referenceImage; // 👈 Kie.ai 的圖生影片必填這個
                    }
                }

                const submitRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: actualModelName, input: kieInput })
                });
                
                const textResponse = await submitRes.text();
                let taskData;
                try { taskData = JSON.parse(textResponse); } catch (e) { throw new Error(`Kie.ai 連線失敗: ${textResponse}`); }

                const taskId = taskData?.data?.id || taskData?.id;
                if (!taskId) throw new Error(`Kie.ai 拒絕任務: ${JSON.stringify(taskData)}`);
                
                let attempts = 0;
                while (attempts < 24) { 
                    await new Promise(r => setTimeout(r, 10000)); 
                    const statusRes = await fetch(`https://api.kie.ai/api/v1/jobs/${taskId}`, { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } });
                    const statusData = await statusRes.json();
                    const status = (statusData.data?.status || statusData.status || '').toUpperCase();
                    
                    if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'SUCCEEDED') {
                        finalUrl = statusData.data?.video_url || statusData.data?.url || statusData.video_url; 
                        break;
                    } else if (status === 'FAILED' || status === 'ERROR') {
                        throw new Error(`Kling 雲端算圖失敗: ${JSON.stringify(statusData)}`);
                    }
                    attempts++;
                }
                if (!finalUrl) throw new Error("Kling 算圖超時");
            } else {
                finalUrl = 'mock'; 
            }
        }
        return res.status(200).json({ success: true, videoUrl: finalUrl });
      }

      case 'suggest_topics': {
        const prompt = `Generate 5 viral YouTube Shorts topic ideas for this channel.\nChannel Niche: ${channel.niche}\nTarget Audience: ${channel.language === 'en' ? 'Global' : 'Taiwan'}\nOutput ONLY a JSON array of strings. Example: ["Topic 1", "Topic 2"]`;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } } });
        return res.status(200).json({ success: true, topics: JSON.parse(cleanJson(response.text || '[]')) });
      }

      // 🚀 找回你剛才不小心刪除的企劃書大腦
      case 'generate_treatment': {
        const generator = new ScriptGenerator(API_KEY);
        const topicToUse = req.body.topic || channel.niche;
        const treatment = await generator.generateTreatment(topicToUse, channel.language || 'zh-TW', req.body.videoType || 'topic', req.body.productDescription);
        return res.status(200).json({ success: true, treatment });
      }

      case 'generate_script': {
        const generator = new ScriptGenerator(API_KEY);
        const targetDuration = req.body.targetDuration || '60';
        const durationPrompt = targetDuration === '30' ? "\n【極重要】腳本總時長必須嚴格控制在 30 秒以內！總字數請限制在 80~100 字左右，節奏要極快。" : "\n【極重要】腳本總時長必須嚴格控制在 60 秒以內！總字數請限制在 150~180 字左右。";
        const topicToUse = (req.body.topic || channel.niche) + durationPrompt;
        
        const script = await generator.generate(topicToUse, channel.language || 'zh-TW', req.body.referenceImage, req.body.productDescription, req.body.videoType || 'topic', req.body.treatment);
        return res.status(200).json({ success: true, script });
      }

      case 'render_mpt': {
        const useStockFootage = channel.mptConfig?.useStockFootage ?? true;
        if (useStockFootage && !PEXELS_API_KEY) return res.status(200).json({ success: false, error: 'PEXELS_API_KEY Missing' });
        const assembler = new VideoAssembler(API_KEY, useStockFootage ? PEXELS_API_KEY! : 'DISABLED');
        const outputFilename = path.join(os.tmpdir(), `mpt_${Date.now()}.mp4`);
        try {
            if (previousVideoUrl && previousVideoUrl.includes('blob.vercel-storage.com')) { try { await del(previousVideoUrl); } catch (e) {} }
            const safeVideoType = req.body.videoType || 'topic';
            await assembler.assemble(safeVideoType, scriptData, outputFilename, channel.mptConfig, req.body.preGeneratedHeygenUrl, req.body.preGeneratedSceneUrls);
            const videoBuffer = fs.readFileSync(outputFilename);
            const blob = await put(`previews/mpt_${Date.now()}.mp4`, videoBuffer, { access: 'public' });
            return res.status(200).json({ success: true, videoUrl: blob.url });
        } catch (e: any) { return res.status(200).json({ success: false, error: `Assembly Failed: ${e.message}` }); }
      }

      default: return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) { return res.status(200).json({ success: false, error: `Server Error: ${e.message}` }); }
}
