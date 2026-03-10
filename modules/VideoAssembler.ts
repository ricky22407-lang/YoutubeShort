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
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return resolve(0);
        const duration = Number(metadata.format?.duration || metadata.streams?.[0]?.duration || 0);
        resolve(isNaN(duration) ? 0 : duration);
      });
    });
  }

  private async downloadFile(url: string, dest: string, timeoutMs: number = 60000): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
        const fileStream = fs.createWriteStream(dest);
        await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
    } catch (e: any) {
        throw e;
    } finally {
        clearTimeout(timeoutId);
    }
  }

  private async fetchDynamicBgm(mood: string): Promise<string> {
      if (!mood || mood === 'none') return '';
      const moodMap: Record<string, string> = {
          epic: '1g4PCrYnwsODXb6nxZrTxFpJ4HXsA3PEn', relaxing: '15oNe3ymR3iI_o7a-yLsMWq2qRJLoojaQ',
          energetic: '1BRyzqjynpi_WOudMNuCt8Hd-XZVP4olT', happy: '11yLdyL-swvjnX5SIHt4UU_ta5BkZ2J5Y',
          chill: '1Z7TTsCMzrFY92jo4H9UmOM6rV5jjQnwF', emotional: '1REsVuxpadReul7F5h4RzfbfWqYgdsd56',
          funny: '1ehNbDhxPRwQ2-G3RaCrtrpFCCvsJXBdt', mysterious: '1CFiBDHVuHAKFNrUtrVxFFTunLJa0xQm2'
      };
      let folderId = moodMap[mood] || moodMap['random'];
      if (mood === 'random') folderId = moodMap[Object.keys(moodMap)[Math.floor(Math.random() * Object.keys(moodMap).length)]];
      if (!folderId || folderId === 'FOLDER_ID_HERE') return '';
      try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&key=${process.env.GOOGLE_DRIVE_API_KEY}`);
          if (!res.ok) return '';
          const files = (await res.json()).files || [];
          if (files.length > 0) return `https://drive.google.com/uc?export=download&id=${files[Math.floor(Math.random() * files.length)].id}`;
      } catch (error) {}
      return '';
  }

  // 🚀 核心更新：加入 preGeneratedSceneUrls 接收前端發包回來的檔案
  async assemble(script: ScriptData, outputFilename: string, config?: any, characterProfile?: any, preGeneratedHeygenUrl?: string, preGeneratedSceneUrls?: Record<number, string>): Promise<string> {
    const sceneAssets: { video: string; audio: string; duration: number; text: string }[] = [];
    
    const bgmVolume = config?.bgmVolume ?? 0.1;
    const fontSize = config?.fontSize ?? 80;
    const useStockFootage = config?.useStockFootage ?? true;
    const videoEngine = config?.videoEngine ?? 'veo';
    const subtitleColor = config?.subtitleColor || '#FFFF00';
    const fontName = config?.fontName || 'NotoSansTC-Bold.ttf';
    let voiceId = config?.voiceId || 'zh-TW-HsiaoChenNeural';
    if (config?.ttsEngine === 'elevenlabs' && config?.elevenLabsVoiceId) voiceId = config.elevenLabsVoiceId;

    const isSingleVideoMode = (videoEngine === 'heygen' && config?.heygenAvatarId);
    let singleVideoPath = '';
    let totalHeygenDuration = 0;

    // 🚀 新版日誌：如果正確部署，Log 會顯示 "前端排程合成"
    console.log(`Starting Asset Gathering... Mode: ${isSingleVideoMode ? 'HeyGen 一鏡到底' : '前端排程合成'}`);

    if (isSingleVideoMode) {
        if (!preGeneratedHeygenUrl) throw new Error("未收到預先生成的 HeyGen 影片網址！");
        singleVideoPath = path.join(this.tempDir, `heygen_full.mp4`);
        await this.downloadFile(preGeneratedHeygenUrl, singleVideoPath);
        totalHeygenDuration = await this.getDuration(singleVideoPath);
        if (totalHeygenDuration <= 0) totalHeygenDuration = 50; 

        const totalChars = script.scenes.map(s => s.narration.replace(/[\n\r\s]+/g, '')).join('').length;
        for (const scene of script.scenes) {
            const cleanNarration = scene.narration.replace(/[\n\r]+/g, ' ').trim();
            const sceneChars = cleanNarration.replace(/\s+/g, '').length;
            const duration = totalHeygenDuration * (sceneChars / Math.max(totalChars, 1));
            sceneAssets.push({ video: singleVideoPath, audio: '', duration: duration, text: cleanNarration });
        }
    } else {
        const resolvedAssets = [];
        for (const scene of script.scenes) {
            const sceneId = scene.id;
            const audioPath = path.join(this.tempDir, `scene_${sceneId}.mp3`);
            let videoPath = path.join(this.tempDir, `scene_${sceneId}.mp4`);
            const cleanNarration = scene.narration.replace(/[\n\r]+/g, ' ').trim();

            if (!fs.existsSync(audioPath)) {
                await this.ttsService.generateAudio(cleanNarration, audioPath, voiceId);
            }
            
            if (!fs.existsSync(videoPath)) {
                // 🚀 直接下載由前端 Orchestrator 提供好的畫面，不再於此處呼叫超時的 Veo API
                if (preGeneratedSceneUrls && preGeneratedSceneUrls[sceneId]) {
                    const url = preGeneratedSceneUrls[sceneId];
                    if (url !== 'mock') {
                        console.log(`[Assembler] 下載預先生成的場景 ${sceneId} 影片...`);
                        await this.downloadFile(url, videoPath);
                    } else {
                        await this.generateAiVideo(scene.visual_cue, videoEngine as any, videoPath);
                    }
                } else {
                    await this.generateAiVideo(scene.visual_cue, videoEngine as any, videoPath);
                }
            }
            
            resolvedAssets.push({ video: videoPath, audio: audioPath, duration: await this.getDuration(audioPath), text: cleanNarration });
        }
        sceneAssets.push(...resolvedAssets);
    }

    const assPath = path.join(this.tempDir, 'subtitles.ass');
    let assEvents = '';
    let currentTime = 0;

    const formatAssTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60), ms = Math.floor((seconds % 1) * 100);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const hexToASS = (hex: string) => {
        const clean = hex.replace('#', '');
        return clean.length === 6 ? `&H00${clean.substring(4, 6)}${clean.substring(2, 4)}${clean.substring(0, 2)}` : '&H0000FFFF';
    };

    for (const asset of sceneAssets) {
        const durationMs = Math.round(asset.duration * 100);
        const words = asset.text.split(''); 
        const charDuration = Math.floor(durationMs / Math.max(words.length, 1));
        let karaokeText = '';
        words.forEach(w => { karaokeText += `{\\k${charDuration}}${w}`; });
        assEvents += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + asset.duration)},Default,,0,0,0,,${karaokeText}\n`;
        currentTime += asset.duration;
    }

    const fontMap: Record<string, string> = { 'NotoSansTC-Bold.ttf': 'Noto Sans TC', 'NotoSerifTC-Bold.ttf': 'Noto Serif TC', 'ZCOOLKuaiLe-Regular.ttf': 'ZCOOL KuaiLe', 'Roboto-Bold.ttf': 'Roboto', 'Anton-Regular.ttf': 'Anton', 'Bangers-Regular.ttf': 'Bangers' };
    const selectedFontFamily = fontMap[fontName] || 'Noto Sans TC';
    const assHeader = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${selectedFontFamily},${fontSize},${config?.subtitleColor ? hexToASS(config.subtitleColor) : '&H0000FFFF'},&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,20,20,350,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
    fs.writeFileSync(assPath, '\uFEFF' + assHeader + assEvents, 'utf8');

    let bgmPath = '';
    if (config?.bgmMood && config.bgmMood !== 'none') {
        const bgmUrl = await this.fetchDynamicBgm(config.bgmMood);
        if (bgmUrl) {
            bgmPath = path.join(this.tempDir, `bgm_${Date.now()}.mp3`);
            try { await this.downloadFile(bgmUrl, bgmPath); } catch (e: any) { bgmPath = ''; }
        }
    }

    return new Promise((resolve, reject) => {
        console.log(`[FFmpeg] 引擎點火！開始進行影像、字幕與音樂的終極合成...`);
        const fontConfigDir = path.join(this.tempDir, 'fontconfig'), localFontDir = path.join(this.tempDir, 'fonts_cache');
        if (!fs.existsSync(fontConfigDir)) fs.mkdirSync(fontConfigDir, { recursive: true });
        if (!fs.existsSync(localFontDir)) fs.mkdirSync(localFontDir, { recursive: true });

        let systemFontDir = path.join(process.cwd(), 'fonts');
        if (!fs.existsSync(systemFontDir)) systemFontDir = path.join(__dirname, '../fonts');
        if (!fs.existsSync(systemFontDir)) systemFontDir = path.join(__dirname, '../../fonts');
        const sourceFontPath = path.join(systemFontDir, fontName), destFontPath = path.join(localFontDir, fontName);
        if (fs.existsSync(sourceFontPath)) fs.copyFileSync(sourceFontPath, destFontPath);

        const fontsConfPath = path.join(fontConfigDir, 'fonts.conf');
        fs.writeFileSync(fontsConfPath, `<?xml version="1.0"?>\n<fontconfig>\n  <dir>${localFontDir}</dir>\n  <cachedir>${fontConfigDir}</cachedir>\n  <config></config>\n</fontconfig>`, 'utf8');
        process.env.FONTCONFIG_PATH = fontConfigDir; process.env.FONTCONFIG_FILE = fontsConfPath;

        const cmd = ffmpeg();
        const filterComplex: string[] = [];
        let vFinal = '', aFinal = '';

        if (isSingleVideoMode) {
            cmd.input(singleVideoPath);
            if (bgmPath && fs.existsSync(bgmPath)) {
                cmd.input(bgmPath);
                filterComplex.push(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v_scaled]`);
                filterComplex.push(`[1:a]aloop=loop=-1:size=2e+09[bgm_loop]`);
                filterComplex.push(`[bgm_loop]volume=${bgmVolume}[bgm_low]`);
                filterComplex.push(`[bgm_low][0:a]amix=inputs=2:duration=shortest:dropout_transition=2[a_mixed]`);
                aFinal = '[a_mixed]';
            } else {
                filterComplex.push(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v_scaled]`);
                aFinal = '0:a';
            }
            vFinal = '[v_scaled]';
        } else {
            sceneAssets.forEach(a => cmd.input(a.video));
            sceneAssets.forEach(a => cmd.input(a.audio));
            if (bgmPath && fs.existsSync(bgmPath)) cmd.input(bgmPath);

            const videoOutputs: string[] = [], audioOutputs: string[] = [];
            sceneAssets.forEach((_, i) => { filterComplex.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v${i}]`); videoOutputs.push(`[v${i}]`); });
            filterComplex.push(`${videoOutputs.join('')}concat=n=${sceneAssets.length}:v=1:a=0[v_concat]`);

            const ttsStartIndex = sceneAssets.length;
            for(let i=0; i<sceneAssets.length; i++) audioOutputs.push(`[${ttsStartIndex + i}:a]`);
            filterComplex.push(`${audioOutputs.join('')}concat=n=${sceneAssets.length}:v=0:a=1[a_tts]`);

            if (bgmPath && fs.existsSync(bgmPath)) {
                const bgmIndex = ttsStartIndex + sceneAssets.length;
                filterComplex.push(`[${bgmIndex}:a]aloop=loop=-1:size=2e+09[bgm_loop]`);
                filterComplex.push(`[bgm_loop]volume=${bgmVolume}[bgm_low]`);
                filterComplex.push(`[bgm_low][a_tts]amix=inputs=2:duration=shortest:dropout_transition=2[a_mixed]`);
                aFinal = '[a_mixed]';
            } else {
                filterComplex.push(`[a_tts]anull[a_mixed]`);
                aFinal = '[a_mixed]';
            }
            vFinal = '[v_concat]';
        }

        const assPathEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        const fontsDirEscaped = localFontDir.replace(/\\/g, '/').replace(/:/g, '\\:');
        filterComplex.push(`${vFinal}ass='${assPathEscaped}':fontsdir='${fontsDirEscaped}'[v_out]`);

        cmd.complexFilter(filterComplex).outputOptions([`-map [v_out]`, `-map ${aFinal}`, '-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-shortest']).output(outputFilename)
           .on('end', () => resolve(outputFilename)).on('error', (err) => reject(err)).run();
    });
  }

  private async generateAiVideo(prompt: string, engine: any, outputPath: string): Promise<void> {
      return new Promise((resolve, reject) => {
          ffmpeg().input('color=c=black:s=720x1280').inputFormat('lavfi').duration(5)
            .videoFilters([`drawtext=text='SIMULATION':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`])
            .output(outputPath).on('end', () => resolve()).on('error', reject).run();
      });
  }
}
