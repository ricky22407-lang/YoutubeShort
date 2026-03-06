import { TTSService } from './TTSService.js';
import { HeyGenService } from './HeyGenService.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe'; 
import fs from 'fs';
import path from 'path';
import os from 'os'; 
import { ScriptData } from '../types.js';
import { searchVideos } from '../services/pexelsService.js';
import { GoogleGenAI } from '@google/genai';
import { finished } from 'stream/promises';
import { Readable } from 'stream';

ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path); 

export class VideoAssembler {
  private tempDir: string;
  private ttsService: TTSService;
  private heyGenService: HeyGenService;
  private pexelsApiKey: string;
  private ai: GoogleGenAI;

  constructor(apiKey: string, pexelsApiKey: string) {
    this.tempDir = path.join(os.tmpdir(), `yt_shorts_${Date.now()}`);
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    this.ttsService = new TTSService();
    this.heyGenService = new HeyGenService();
    this.pexelsApiKey = pexelsApiKey;
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);
    const fileStream = fs.createWriteStream(dest);
    await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
  }

  private async getFilesInDriveFolder(folderId: string): Promise<{ id: string; name: string }[]> {
      const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      if (!apiKey) return [];
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&key=${apiKey}`;
      try {
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return data.files || [];
      } catch (error) {
          return [];
      }
  }

  private async fetchDynamicBgm(mood: string): Promise<string> {
      if (!mood || mood === 'none') return '';
      const moodMap: Record<string, string> = {
          epic: '1g4PCrYnwsODXb6nxZrTxFpJ4HXsA3PEn', 
          relaxing: '15oNe3ymR3iI_o7a-yLsMWq2qRJLoojaQ',
          energetic: '1BRyzqjynpi_WOudMNuCt8Hd-XZVP4olT',
          happy: '11yLdyL-swvjnX5SIHt4UU_ta5BkZ2J5Y',
          chill: '1Z7TTsCMzrFY92jo4H9UmOM6rV5jjQnwF',
          emotional: '1REsVuxpadReul7F5h4RzfbfWqYgdsd56',
          funny: '1ehNbDhxPRwQ2-G3RaCrtrpFCCvsJXBdt',
          mysterious: '1CFiBDHVuHAKFNrUtrVxFFTunLJa0xQm2'
      };

      let folderId = moodMap[mood];
      if (mood === 'random') {
          const keys = Object.keys(moodMap);
          folderId = moodMap[keys[Math.floor(Math.random() * keys.length)]];
      }

      if (!folderId || folderId === 'FOLDER_ID_HERE') return '';

      try {
          console.log(`Fetching BGM from Google Drive (Mood: ${mood})...`);
          const files = await this.getFilesInDriveFolder(folderId);
          if (files.length > 0) {
              const randomFile = files[Math.floor(Math.random() * files.length)];
              return `https://drive.google.com/uc?export=download&id=${randomFile.id}`;
          }
      } catch (error) {
          console.error("Failed to fetch BGM:", error);
      }
      return '';
  }

  async assemble(script: ScriptData, outputFilename: string, config?: any, characterProfile?: any): Promise<string> {
    const bgmVolume = config?.bgmVolume ?? 0.1;
    const fontSize = config?.fontSize ?? 80;
    const useStockFootage = config?.useStockFootage ?? true;
    const videoEngine = config?.videoEngine ?? 'veo';
    const subtitleColor = config?.subtitleColor || '#FFFF00';
    const ttsEngine = config?.ttsEngine || 'edge';
    const fontName = config?.fontName || 'NotoSansTC-Bold.ttf';
    const bgmMood = config?.bgmMood || 'none';
    
    let voiceId = config?.voiceId || 'zh-TW-HsiaoChenNeural';
    if (ttsEngine === 'elevenlabs' && config?.elevenLabsVoiceId) {
        voiceId = config.elevenLabsVoiceId;
    }

    const isSingleVideoMode = (videoEngine === 'heygen' && config?.heygenAvatarId);
    let singleVideoPath = '';
    let totalHeygenDuration = 0;
    const sceneAssets: { video: string; audio: string; duration: number; text: string }[] = [];

    console.log(`Starting Asset Gathering... Mode: ${isSingleVideoMode ? 'HeyGen 一鏡到底 (省點數模式)' : '平行合成模式'}`);

    // 1. Gather Assets
    if (isSingleVideoMode) {
        // === 🚀 戰略 2：極致省錢一鏡到底模式 ===
        const fullText = script.scenes.map(s => s.narration).join(' ');
        singleVideoPath = path.join(this.tempDir, `heygen_full.mp4`);
        
        console.log(`[HeyGen] 正在發送合併請求 (省去多次扣款)，腳本總字數: ${fullText.length}`);
        const heyGenUrl = await this.heyGenService.generateVideo(fullText, config.heygenAvatarId, voiceId);
        
        console.log(`[HeyGen] 下載完成的一鏡到底影片...`);
        await this.downloadFile(heyGenUrl, singleVideoPath);
        totalHeygenDuration = await this.getDuration(singleVideoPath);
        
    } else {
        // === 🚀 戰略 1：素材/Veo的平行加速處理 ===
        const assetPromises = script.scenes.map(async (scene) => {
            const sceneId = scene.id;
            const audioPath = path.join(this.tempDir, `scene_${sceneId}.mp3`);
            let videoPath = path.join(this.tempDir, `scene_${sceneId}.mp4`);

            if (!fs.existsSync(audioPath)) {
                await this.ttsService.generateAudio(scene.narration, audioPath, voiceId);
            }
            
            if (!fs.existsSync(videoPath)) {
                const isFirstSceneWithProduct = script.referenceImage && scene.id === 1;
                if (useStockFootage && !isFirstSceneWithProduct) {
                    const videoUrls = await searchVideos(scene.visual_cue, this.pexelsApiKey);
                    if (videoUrls.length > 0) {
                        await this.downloadFile(videoUrls[0], videoPath);
                    } else {
                        await this.generateAiVideo(scene.visual_cue, videoEngine as any, videoPath, characterProfile, script.referenceImage);
                    }
                } else {
                    await this.generateAiVideo(scene.visual_cue, videoEngine as any, videoPath, characterProfile, script.referenceImage);
                }
            }

            const duration = await this.getDuration(audioPath);
            return { video: videoPath, audio: audioPath, duration: duration, text: scene.narration };
        });

        const resolvedAssets = await Promise.all(assetPromises);
        sceneAssets.push(...resolvedAssets);
    }

    // 2. 字幕與時間軸處理 (ASS)
    const assPath = path.join(this.tempDir, 'subtitles.ass');
    let assEvents = '';
    let currentTime = 0;

    const parseVttTime = (timeStr: string): number => {
        const parts = timeStr.split(':');
        return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    };

    const formatAssTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const hexToASS = (hex: string) => {
        const clean = hex.replace('#', '');
        return clean.length === 6 ? `&H00${clean.substring(4, 6)}${clean.substring(2, 4)}${clean.substring(0, 2)}` : '&H00FFFF';
    };

    if (isSingleVideoMode) {
        // HeyGen 一鏡到底：用字數比例精準切分字幕時長 (保留卡拉OK效果)
        const totalChars = script.scenes.map(s => s.narration).join('').replace(/\s+/g, '').length;
        for (const scene of script.scenes) {
            const sceneChars = scene.narration.replace(/\s+/g, '').length;
            const duration = totalHeygenDuration * (sceneChars / Math.max(totalChars, 1));
            const start = currentTime;
            const end = currentTime + duration;
            
            const durationMs = Math.round(duration * 100);
            const words = scene.narration.split(''); 
            const charDuration = Math.floor(durationMs / Math.max(words.length, 1));
            let karaokeText = '';
            words.forEach(w => { karaokeText += `{\\k${charDuration}}${w}`; });

            assEvents += `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${karaokeText}\n`;
            currentTime += duration;
        }
    } else {
        // 傳統多片段：讀取 VTT 產生精準字幕
        for (const asset of sceneAssets) {
            const vttPath = asset.audio.replace('.mp3', '.vtt');
            if (fs.existsSync(vttPath)) {
                const vttContent = fs.readFileSync(vttPath, 'utf-8');
                const lines = vttContent.split('\n');
                let i = 0;
                while (i < lines.length) {
                    if (lines[i].includes('-->')) {
                        const times = lines[i].split('-->');
                        const start = parseVttTime(times[0].trim());
                        const end = parseVttTime(times[1].trim());
                        const text = lines[i + 1]?.trim(); 
                        if (text) {
                            const durationMs = Math.round((end - start) * 100); 
                            const words = text.split(''); 
                            const charDuration = Math.floor(durationMs / words.length);
                            let karaokeText = '';
                            words.forEach(w => { karaokeText += `{\\k${charDuration}}${w}`; });
                            assEvents += `Dialogue: 0,${formatAssTime(currentTime + start)},${formatAssTime(currentTime + end)},Default,,0,0,0,,${karaokeText}\n`;
                        }
                        i += 2; 
                    } else { i++; }
                }
            } else {
                assEvents += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + asset.duration)},Default,,0,0,0,,${asset.text}\n`;
            }
            currentTime += asset.duration;
        }
    }

    const fontMap: Record<string, string> = {
        'NotoSansTC-Bold.ttf': 'Noto Sans TC',
        'NotoSerifTC-Bold.ttf': 'Noto Serif TC',
        'ZCOOLKuaiLe-Regular.ttf': 'ZCOOL KuaiLe',
        'Roboto-Bold.ttf': 'Roboto',
        'Anton-Regular.ttf': 'Anton',
        'Bangers-Regular.ttf': 'Bangers'
    };
    
    const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontMap[fontName] || 'Arial'},${fontSize},${config?.subtitleColor ? hexToASS(config.subtitleColor) : '&H00FFFF'},&H00FFFFFF,&H000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,20,20,350,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    fs.writeFileSync(assPath, assHeader + assEvents);

    // 3. 下載 BGM
    let bgmPath = '';
    if (bgmMood && bgmMood !== 'none') {
        const bgmUrl = await this.fetchDynamicBgm(bgmMood);
        if (bgmUrl) {
            bgmPath = path.join(this.tempDir, `bgm_${Date.now()}.mp3`);
            try { await this.downloadFile(bgmUrl, bgmPath); } 
            catch (e) { console.error("BGM Download Failed", e); bgmPath = ''; }
        }
    }

    // 4. 啟動 FFmpeg 終極渲染
    return new Promise((resolve, reject) => {
        const cmd = ffmpeg();
        const filterComplex: string[] = [];
        let vFinal = '';
        let aFinal = '';

        if (isSingleVideoMode) {
            // 分支 A: HeyGen 一鏡到底渲染
            cmd.input(singleVideoPath);
            if (bgmPath && fs.existsSync(bgmPath)) {
                cmd.input(bgmPath);
                filterComplex.push(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v_scaled]`);
                filterComplex.push(`[1:a]aloop=loop=-1:size=2e+09[bgm_loop]`);
                filterComplex.push(`[bgm_loop]volume=${bgmVolume}[bgm_low]`);
                filterComplex.push(`[bgm_low][0:a]amix=inputs=2:duration=first:dropout_transition=2[a_mixed]`);
                aFinal = '[a_mixed]';
            } else {
                filterComplex.push(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v_scaled]`);
                aFinal = '0:a';
            }
            vFinal = '[v_scaled]';

        } else {
            // 分支 B: 傳統多片段拼接渲染
            sceneAssets.forEach(a => cmd.input(a.video));
            sceneAssets.forEach(a => cmd.input(a.audio));
            if (bgmPath && fs.existsSync(bgmPath)) cmd.input(bgmPath);

            const videoOutputs: string[] = [];
            const audioOutputs: string[] = [];

            sceneAssets.forEach((_, i) => {
                filterComplex.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v${i}]`);
                videoOutputs.push(`[v${i}]`);
            });
            filterComplex.push(`${videoOutputs.join('')}concat=n=${sceneAssets.length}:v=1:a=0[v_concat]`);

            const ttsStartIndex = sceneAssets.length;
            for(let i=0; i<sceneAssets.length; i++) audioOutputs.push(`[${ttsStartIndex + i}:a]`);
            filterComplex.push(`${audioOutputs.join('')}concat=n=${sceneAssets.length}:v=0:a=1[a_tts]`);

            if (bgmPath && fs.existsSync(bgmPath)) {
                const bgmIndex = ttsStartIndex + sceneAssets.length;
                filterComplex.push(`[${bgmIndex}:a]aloop=loop=-1:size=2e+09[bgm_loop]`);
                filterComplex.push(`[bgm_loop]volume=${bgmVolume}[bgm_low]`);
                filterComplex.push(`[bgm_low][a_tts]amix=inputs=2:duration=first:dropout_transition=2[a_mixed]`);
                aFinal = '[a_mixed]';
            } else {
                filterComplex.push(`[a_tts]anull[a_mixed]`);
                aFinal = '[a_mixed]';
            }
            vFinal = '[v_concat]';
        }

        // 壓上字幕並輸出
        const assPathEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        const fontsDirEscaped = path.join(process.cwd(), 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:');
        filterComplex.push(`${vFinal}ass='${assPathEscaped}':fontsdir='${fontsDirEscaped}'[v_out]`);

        cmd.complexFilter(filterComplex)
           .outputOptions([
               `-map [v_out]`,
               `-map ${aFinal}`,
               '-c:v libx264',
               '-pix_fmt yuv420p',
               '-c:a aac',
               '-shortest'
           ])
           .output(outputFilename)
           .on('end', () => {
               console.log('🎉 終極影片渲染完成:', outputFilename);
               resolve(outputFilename);
           })
           .on('error', (err) => {
               console.error('❌ FFmpeg 渲染失敗:', err);
               reject(err);
           })
           .run();
    });
  }

  private async generateAiVideo(prompt: string, engine: 'veo' | 'sora' | 'jimeng', outputPath: string, characterProfile?: any, referenceImage?: string): Promise<void> {
      // 原本的邏輯完全不動，保持 VEO 的兼容性
      console.log(`Generating AI Video with ${engine}: ${prompt}`);
      let finalPrompt = prompt;
      let imageInput = undefined;

      if (referenceImage && typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) {
          const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
          if (match) imageInput = { mimeType: match[1], imageBytes: match[2] };
      } 

      if (engine === 'veo') {
          try {
            let operation = await this.ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: finalPrompt,
                image: imageInput,
                config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
            });

            let attempts = 0;
            while (!operation.done && attempts < 30) { 
                await new Promise(r => setTimeout(r, 5000));
                operation = await this.ai.operations.getVideosOperation({ operation });
                attempts++;
            }

            if (!operation.done || !operation.response?.generatedVideos?.[0]?.video?.uri) throw new Error("Veo Timeout");

            const videoUri = operation.response.generatedVideos[0].video.uri;
            const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
            const fileStream = fs.createWriteStream(outputPath);
            await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
            return;
          } catch (e) {
              console.error("Veo Generation Error:", e);
          }
      }

      return new Promise((resolve, reject) => {
          ffmpeg().input('color=c=black:s=720x1280').inputFormat('lavfi').duration(5)
            .videoFilters([`drawtext=text='${engine.toUpperCase()} SIMULATION':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`])
            .output(outputPath).on('end', () => resolve()).on('error', reject).run();
      });
  }
}