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

      case 'generate_video_submit': {
        const { visualCue, isFirstSceneWithProduct, useStockFootage, videoEngine, referenceImage, klingModelVersion } = req.body;
        const tryPexels = useStockFootage && !isFirstSceneWithProduct;
        
        if (tryPexels && PEXELS_API_KEY) {
            const videoUrls = await searchVideos(visualCue, PEXELS_API_KEY);
            if (videoUrls.length > 0) return res.status(200).json({ success: true, isStock: true, videoUrl: videoUrls[0] });
        }
        
        if (videoEngine === 'veo') {
            let imageInput = undefined;
            if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) {
                const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
                if (match) imageInput = { mimeType: match[1], imageBytes: match[2] };
            }
            const operation = await ai.models.generateVideos({
                model: 'veo-2.0-generate-001', prompt: visualCue, image: imageInput,
                config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' }
            });
            return res.status(200).json({ success: true, isStock: false, taskId: operation.name, operation });
        } 
        else if (videoEngine === 'kling') {
            const KIE_API_KEY = process.env.KIE_API_KEY;
            if (!KIE_API_KEY) return res.status(500).json({ success: false, error: "缺少 KIE_API_KEY" });
            
            let imageUrlToUse = referenceImage;
            if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) {
                try {
                    const base64Data = referenceImage.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    const mimeType = referenceImage.split(';')[0].split(':')[1];
                    const ext = mimeType.split('/')[1] || 'png';
                    const blob = await put(`refs/ref_${Date.now()}.${ext}`, buffer, { access: 'public' });
                    imageUrlToUse = blob.url;
                } catch (e: any) { throw new Error(`圖片轉網址失敗: ${e.message}`); }
            }

            const selectedKlingModel = klingModelVersion || 'kling-3.0';
            let actualModelName = "kling-3.0/video"; 
            if (selectedKlingModel === 'kling-2.6-pro') actualModelName = imageUrlToUse ? "kling-2.6/image-to-video" : "kling-2.6/text-to-video";
            else if (selectedKlingModel === 'kling-2.5-turbo') actualModelName = imageUrlToUse ? "kling/v2-5-turbo-image-to-video-pro" : "kling/v2-5-turbo-text-to-video-pro";

            const kieInput: any = { prompt: visualCue, duration: "5", sound: false };
            if (imageUrlToUse) { kieInput.image_urls = [imageUrlToUse]; } else { kieInput.aspect_ratio = "9:16"; }
            if (actualModelName === "kling-3.0/video") { kieInput.mode = "pro"; kieInput.multi_shots = false; }

            const submitRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
                method: 'POST', headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: actualModelName, input: kieInput })
            });
            
            const textResponse = await submitRes.text();
            let taskData;
            try { taskData = JSON.parse(textResponse); } catch (e) { throw new Error(`Kie.ai 連線失敗: ${textResponse}`); }

            const taskId = taskData?.data?.taskId || taskData?.taskId || taskData?.data?.id || taskData?.id;
            if (!taskId) throw new Error(`Kie.ai 拒絕任務: ${JSON.stringify(taskData)}`);
            
            return res.status(200).json({ success: true, isStock: false, taskId });
        } else {
            return res.status(200).json({ success: true, isStock: true, videoUrl: 'mock' }); 
        }
      }

      case 'generate_video_status': {
        const { videoEngine, taskId, operation } = req.body;
        
        if (videoEngine === 'veo') {
            try {
                const currentOp = await ai.operations.getVideosOperation({ operation: operation || { name: taskId } });
                if (currentOp.done) {
                    const uri = currentOp.response?.generatedVideos?.[0]?.video?.uri;
                    if (uri) return res.status(200).json({ success: true, status: 'completed', videoUrl: `${uri}&key=${API_KEY}` });
                    else return res.status(200).json({ success: true, status: 'failed', error: 'Veo 生成完畢但沒有影片網址' });
                }
                return res.status(200).json({ success: true, status: 'processing' });
            } catch (e: any) { return res.status(200).json({ success: true, status: 'failed', error: e.message }); }
        } 
        else if (videoEngine === 'kling') {
            const KIE_API_KEY = process.env.KIE_API_KEY;
            const statusUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;
            const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } });
            const statusData = await statusRes.json();
            
            const rawStatus = statusData.data?.state || statusData.data?.status || statusData.state || statusData.status || '';
            const status = String(rawStatus).toUpperCase();
            
            if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'SUCCEEDED') {
                let finalUrl = statusData.data?.video_url || statusData.data?.videoUrl || statusData.data?.url || statusData.data?.response?.video_url || statusData.data?.result?.video_url || statusData.video_url; 
                if (!finalUrl && typeof statusData.data?.result === 'string' && statusData.data.result.startsWith('http')) finalUrl = statusData.data.result;

                // 🚀 終極修復：解開 Kie.ai 隱藏的 resultJson 封印
                if (!finalUrl && statusData.data?.resultJson) {
                    try {
                        const parsedResult = JSON.parse(statusData.data.resultJson);
                        if (parsedResult.resultUrls && parsedResult.resultUrls.length > 0) {
                            finalUrl = parsedResult.resultUrls[0];
                        }
                    } catch (parseError) {
                        console.error("[Kling] resultJson 解析失敗:", parseError);
                    }
                }

                if (!finalUrl) {
                    return res.status(200).json({ success: true, status: 'failed', error: `Kie.ai 顯示算圖成功，但 API 拒絕交出影片網址！原始資料: ${JSON.stringify(statusData)}` });
                }
                
                return res.status(200).json({ success: true, status: 'completed', videoUrl: finalUrl });
            } else if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') {
                return res.status(200).json({ success: true, status: 'failed', error: JSON.stringify(statusData) });
            }
            return res.status(200).json({ success: true, status: 'processing' });
        }
        return res.status(400).json({ success: false, error: '未知的引擎' });
      }

      case 'suggest_topics': {
        const prompt = `Generate 5 viral YouTube Shorts topic ideas for this channel.\nChannel Niche: ${channel.niche}\nTarget Audience: ${channel.language === 'en' ? 'Global' : 'Taiwan'}\nOutput ONLY a JSON array of strings. Example: ["Topic 1", "Topic 2"]`;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } } });
        return res.status(200).json({ success: true, topics: JSON.parse(cleanJson(response.text || '[]')) });
      }

      case 'generate_treatment': {
        const generator = new ScriptGenerator(API_KEY);
        const topicToUse = req.body.topic || channel.niche;
        const treatment = await generator.generateTreatment(topicToUse, channel.language || 'zh-TW', req.body.videoType || 'topic', req.body.productDescription, req.body.targetDuration, req.body.allowNoVoiceover);
        return res.status(200).json({ success: true, treatment });
      }

      case 'generate_script': {
        const generator = new ScriptGenerator(API_KEY);
        const topicToUse = req.body.topic || channel.niche;
        const script = await generator.generate(topicToUse, channel.language || 'zh-TW', req.body.referenceImage, req.body.productDescription, req.body.videoType || 'topic', req.body.treatment, req.body.targetDuration, req.body.allowNoVoiceover);
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
        } catch (e: any) { 
            const errorMsg = e instanceof Error ? e.message : (e?.message || (typeof e === 'object' ? JSON.stringify(e) : String(e)));
            return res.status(200).json({ success: false, error: `Assembly Failed: ${errorMsg}` }); 
        }
      }

      default: return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) { 
    const errorMsg = e instanceof Error ? e.message : (e?.message || String(e));
    return res.status(200).json({ success: false, error: `Server Error: ${errorMsg}` }); 
  }
}
