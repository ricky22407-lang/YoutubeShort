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
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT'); res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'); return res.status(200).end(); }
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: `Method Not Allowed` });
    const API_KEY = process.env.API_KEY; const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
    if (!API_KEY) return res.status(200).json({ success: false, error: 'System API_KEY Missing' });

    const { stage, channel, scriptData, previousVideoUrl } = req.body;
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    switch (stage) {
      case 'heygen_submit': { /* ... existing heygen ... */ 
        const heyGen = new HeyGenService(); const fullText = scriptData.scenes.map((s: any) => s.narration).join(' '); let voiceId = channel.mptConfig?.voiceId || 'zh-TW-HsiaoChenNeural'; if (channel.mptConfig?.ttsEngine === 'elevenlabs' && channel.mptConfig?.elevenLabsVoiceId) voiceId = channel.mptConfig.elevenLabsVoiceId; const heygenIdInput = (channel.mptConfig?.heygenAvatarId || '').trim(); let finalAvatarIds: string[] = []; if (!heygenIdInput) return res.status(200).json({ success: false, error: '未提供 HeyGen Avatar ID' }); if (heygenIdInput.includes(',')) finalAvatarIds = heygenIdInput.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0); else { const groupLooks = await heyGen.getAvatarGroupLooks(heygenIdInput); if (groupLooks.length > 0) finalAvatarIds = groupLooks; else finalAvatarIds = [heygenIdInput]; } const selectedAvatarId = finalAvatarIds[Math.floor(Math.random() * finalAvatarIds.length)]; const scale = channel.mptConfig?.avatarScale || 1.0; const videoId = await heyGen.submitVideoTask(fullText, selectedAvatarId, voiceId, scale); return res.status(200).json({ success: true, videoId });
      }
      case 'heygen_status': { const heyGen = new HeyGenService(); const result = await heyGen.checkVideoStatus(req.body.videoId); return res.status(200).json({ success: true, status: result.status, videoUrl: result.url }); }
      
      case 'generate_video_submit': {
        const { visualCue, isFirstSceneWithProduct, useStockFootage, videoEngine, referenceImage, klingModelVersion } = req.body;
        const tryPexels = useStockFootage && !isFirstSceneWithProduct;
        if (tryPexels && PEXELS_API_KEY) { const videoUrls = await searchVideos(visualCue, PEXELS_API_KEY); if (videoUrls.length > 0) return res.status(200).json({ success: true, isStock: true, videoUrl: videoUrls[0] }); }
        
        if (videoEngine === 'veo') {
            let imageInput = undefined; if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) { const match = referenceImage.match(/^data:(.+);base64,(.+)$/); if (match) imageInput = { mimeType: match[1], imageBytes: match[2] }; }
            const operation = await ai.models.generateVideos({ model: 'veo-2.0-generate-001', prompt: visualCue, image: imageInput, config: { numberOfVideos: 1, aspectRatio: '9:16' } }); return res.status(200).json({ success: true, isStock: false, taskId: operation.name, operation });
        } else if (videoEngine === 'kling') {
            const KIE_API_KEY = process.env.KIE_API_KEY; if (!KIE_API_KEY) return res.status(500).json({ success: false, error: "缺少 KIE_API_KEY" });
            let imageUrlToUse = referenceImage;
            if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) { try { const base64Data = referenceImage.split(',')[1]; const buffer = Buffer.from(base64Data, 'base64'); const ext = referenceImage.split(';')[0].split(':')[1].split('/')[1] || 'png'; const blob = await put(`refs/ref_${Date.now()}.${ext}`, buffer, { access: 'public' }); imageUrlToUse = blob.url; } catch (e: any) { throw new Error(`圖片轉網址失敗: ${e.message}`); } }
            const selectedKlingModel = klingModelVersion || 'kling-3.0'; let actualModelName = "kling-3.0/video"; if (selectedKlingModel === 'kling-2.6-pro') actualModelName = imageUrlToUse ? "kling-2.6/image-to-video" : "kling-2.6/text-to-video"; else if (selectedKlingModel === 'kling-2.5-turbo') actualModelName = imageUrlToUse ? "kling/v2-5-turbo-image-to-video-pro" : "kling/v2-5-turbo-text-to-video-pro";
            const kieInput: any = { prompt: visualCue, duration: "5", sound: false }; if (imageUrlToUse) { kieInput.image_urls = [imageUrlToUse]; } else { kieInput.aspect_ratio = "9:16"; } if (actualModelName === "kling-3.0/video") { kieInput.mode = "pro"; kieInput.multi_shots = false; }
            const submitRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', { method: 'POST', headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: actualModelName, input: kieInput }) });
            const textResponse = await submitRes.text(); let taskData; try { taskData = JSON.parse(textResponse); } catch (e) { throw new Error(`Kie.ai 連線失敗: ${textResponse}`); }
            const taskId = taskData?.data?.taskId || taskData?.taskId || taskData?.data?.id || taskData?.id; if (!taskId) throw new Error(`Kie.ai 拒絕任務: ${JSON.stringify(taskData)}`);
            return res.status(200).json({ success: true, isStock: false, taskId });
        } else { return res.status(200).json({ success: true, isStock: true, videoUrl: 'mock' }); }
      }

      case 'generate_video_status': {
        const { videoEngine, taskId, operation } = req.body;
        if (videoEngine === 'veo') {
            try { const currentOp = await ai.operations.getVideosOperation({ operation: operation || { name: taskId } }); if (currentOp.done) { const uri = currentOp.response?.generatedVideos?.[0]?.video?.uri; if (uri) return res.status(200).json({ success: true, status: 'completed', videoUrl: `${uri}&key=${API_KEY}` }); else return res.status(200).json({ success: true, status: 'failed', error: 'Veo 生成完畢但沒有影片網址' }); } return res.status(200).json({ success: true, status: 'processing' }); } catch (e: any) { return res.status(200).json({ success: true, status: 'failed', error: e.message }); }
        } else if (videoEngine === 'kling') {
            const KIE_API_KEY = process.env.KIE_API_KEY; const statusRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }); const statusData = await statusRes.json();
            const status = String(statusData.data?.state || statusData.data?.status || statusData.state || statusData.status || '').toUpperCase();
            if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'SUCCEEDED') {
                let finalUrl = statusData.data?.video_url || statusData.data?.videoUrl || statusData.data?.url || statusData.data?.response?.video_url || statusData.data?.result?.video_url || statusData.video_url; if (!finalUrl && typeof statusData.data?.result === 'string' && statusData.data.result.startsWith('http')) finalUrl = statusData.data.result;
                if (!finalUrl && statusData.data?.resultJson) { try { const parsedResult = JSON.parse(statusData.data.resultJson); if (parsedResult.resultUrls && parsedResult.resultUrls.length > 0) finalUrl = parsedResult.resultUrls[0]; } catch (e) {} }
                if (!finalUrl) return res.status(200).json({ success: true, status: 'failed', error: `API 未回傳影片網址！原始資料: ${JSON.stringify(statusData)}` });
                return res.status(200).json({ success: true, status: 'completed', videoUrl: finalUrl });
            } else if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') { return res.status(200).json({ success: true, status: 'failed', error: JSON.stringify(statusData) }); }
            return res.status(200).json({ success: true, status: 'processing' });
        } return res.status(400).json({ success: false, error: '未知的引擎' });
      }

      case 'generate_treatment': { const generator = new ScriptGenerator(API_KEY); const treatment = await generator.generateTreatment(req.body.topic || channel.niche, channel.language || 'zh-TW', req.body.videoType || 'topic', req.body.productDescription, req.body.targetDuration, req.body.allowNoVoiceover); return res.status(200).json({ success: true, treatment }); }
      case 'generate_script': { const generator = new ScriptGenerator(API_KEY); const script = await generator.generate(req.body.topic || channel.niche, channel.language || 'zh-TW', req.body.referenceImage, req.body.productDescription, req.body.videoType || 'topic', req.body.treatment, req.body.targetDuration, req.body.allowNoVoiceover); return res.status(200).json({ success: true, script }); }

      // 🌟 新增的路由：專門用來處理單幕 (不超過 10 秒即完成)
      case 'render_scene_chunk': {
          const { scene, videoUrl, mptConfig } = req.body;
          const assembler = new VideoAssembler(API_KEY, PEXELS_API_KEY!);
          const outputPath = path.join(os.tmpdir(), `chunk_${scene.id}_${Date.now()}.mp4`);
          await assembler.renderSceneChunk(scene, videoUrl, mptConfig, outputPath);
          const buffer = fs.readFileSync(outputPath);
          const blob = await put(`chunks/scene_${scene.id}_${Date.now()}.mp4`, buffer, { access: 'public' });
          return res.status(200).json({ success: true, chunkUrl: blob.url });
      }

      // 🌟 新增的路由：專門用來瞬間合併 (不重新編碼，不到 5 秒完成)
      case 'stitch_final': {
          const { chunkUrls, mptConfig, previousVideoUrl } = req.body;
          const assembler = new VideoAssembler(API_KEY, PEXELS_API_KEY!);
          const outputPath = path.join(os.tmpdir(), `final_${Date.now()}.mp4`);
          if (previousVideoUrl && previousVideoUrl.includes('blob.vercel-storage.com')) { try { await del(previousVideoUrl); } catch (e) {} }
          await assembler.stitchFinal(chunkUrls, mptConfig, outputPath);
          const buffer = fs.readFileSync(outputPath);
          const blob = await put(`previews/mpt_${Date.now()}.mp4`, buffer, { access: 'public' });
          return res.status(200).json({ success: true, videoUrl: blob.url });
      }

      // (保留給 HeyGen 數字人模式使用)
      case 'render_mpt': {
          const assembler = new VideoAssembler(API_KEY, PEXELS_API_KEY!);
          const outputPath = path.join(os.tmpdir(), `mpt_${Date.now()}.mp4`);
          if (previousVideoUrl && previousVideoUrl.includes('blob.vercel-storage.com')) { try { await del(previousVideoUrl); } catch (e) {} }
          await assembler.assemble('avatar', scriptData, outputPath, channel.mptConfig, req.body.preGeneratedHeygenUrl, {});
          const buffer = fs.readFileSync(outputPath);
          const blob = await put(`previews/mpt_${Date.now()}.mp4`, buffer, { access: 'public' });
          return res.status(200).json({ success: true, videoUrl: blob.url });
      }

      default: return res.status(400).json({ success: false, error: 'Invalid Stage' });
    }
  } catch (e: any) { return res.status(200).json({ success: false, error: `Server Error: ${e instanceof Error ? e.message : String(e)}` }); }
}
