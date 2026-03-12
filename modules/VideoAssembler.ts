import { TTSService } from './TTSService.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe'; 
import fs from 'fs';
import path from 'path';
import os from 'os'; 
import { ScriptData } from '../types.js';

ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path); 

export class VideoAssembler {
  private tempDir: string;
  private ttsService: TTSService;

  constructor(apiKey: string, pexelsApiKey: string) {
    this.tempDir = path.join(os.tmpdir(), `yt_shorts_${Date.now()}`);
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    this.ttsService = new TTSService();
  }

  private escapeForFfmpeg(str: string) { return str.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/'/g, "\\'").replace(/ /g, '\\ '); }

  private async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return resolve(0);
        const duration = Number(metadata.format?.duration || metadata.streams?.[0]?.duration || 0);
        resolve(isNaN(duration) ? 0 : duration);
      });
    });
  }

  private async downloadFile(url: string, dest: string, timeoutMs: number = 30000, retries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
            clearTimeout(timeoutId); return;
        } catch (e: any) {
            clearTimeout(timeoutId);
            if (attempt === retries) throw new Error(e.message);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
  }

  private async fetchDynamicBgm(mood: string): Promise<string> {
      if (!mood || mood === 'none') return '';
      const moodMap: Record<string, string> = { emotional: '1REsVuxpadReul7F5h4RzfbfWqYgdsd56', energetic: '1BRyzqjynpi_WOudMNuCt8Hd-XZVP4olT', funny: '1ehNbDhxPRwQ2-G3RaCrtrpFCCvsJXBdt', Relaxing: '15oNe3ymR3iI_o7a-yLsMWq2qRJLoojaQ', Happy: '11yLdyL-swvjnX5SIHt4UU_ta5BkZ2J5Y', Chill: '1Z7TTsCMzrFY92jo4H9UmOM6rV5jjQnwF', Epic: '1g4PCrYnwsODXb6nxZrTxFpJ4HXsA3PEn' };
      let folderId = moodMap[mood] || moodMap['random'];
      if (mood === 'random') folderId = moodMap[Object.keys(moodMap)[Math.floor(Math.random() * Object.keys(moodMap).length)]];
      try {
          if (process.env.GOOGLE_DRIVE_API_KEY) {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&key=${process.env.GOOGLE_DRIVE_API_KEY}`);
              if (res.ok) {
                  const data = await res.json();
                  const files = data.files || [];
                  if (files.length > 0) {
                      const fileId = files[Math.floor(Math.random() * files.length)].id;
                      return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${process.env.GOOGLE_DRIVE_API_KEY}`;
                  }
              }
          }
      } catch (error) {} 
      return 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3';
  }

  private async generateAiVideoMock(outputPath: string): Promise<void> {
      return new Promise((resolve, reject) => { ffmpeg().input('color=c=black:s=720x1280').inputFormat('lavfi').duration(5).output(outputPath).on('end', () => resolve()).on('error', (err) => reject(new Error(err instanceof Error ? err.message : String(err)))).run(); });
  }

  async assemble(videoType: string, script: ScriptData, outputFilename: string, config?: any, preGeneratedHeygenUrl?: string, preGeneratedSceneUrls?: Record<number, string>): Promise<string> {
      const commonSettings = { bgmVolume: config?.bgmVolume ?? 0.1, fontSize: config?.fontSize ?? 60, subtitleColor: config?.subtitleColor || '#FFFF00', fontName: config?.fontName || 'NotoSansTC-Bold.ttf', voiceId: config?.voiceId || 'zh-TW-HsiaoChenNeural', bgmMood: config?.bgmMood || 'none' };
      return this.assembleAvatarPipeline(script, outputFilename, commonSettings, preGeneratedHeygenUrl);
  }

  async renderSceneChunk(scene: any, videoUrl: string, config: any, outputPath: string): Promise<string> {
      const audioPath = path.join(this.tempDir, `raw_a_${scene.id}.mp3`);
      const videoPath = path.join(this.tempDir, `raw_v_${scene.id}.mp4`);
      const cleanNarration = scene.narration.replace(/[\n\r]+/g, ' ').trim();
      const ttsEngine = config?.ttsEngine || 'edge';
      const voiceId = config?.voiceId || 'zh-TW-HsiaoChenNeural';

      let audioDur = 0;
      if (cleanNarration.length > 0) {
          try {
              await this.ttsService.generateAudio(cleanNarration, audioPath, voiceId, ttsEngine);
              audioDur = await this.getDuration(audioPath);
          } catch(e) { console.warn("TTS失敗，將產生靜音:", e); }
      }
      if (audioDur <= 0) {
          await new Promise<void>((res, rej) => { ffmpeg().input('anullsrc').inputFormat('lavfi').outputOptions(['-t 3']).audioCodec('libmp3lame').output(audioPath).on('end', res).on('error', rej).run(); });
          audioDur = 3;
      }

      if (videoUrl && videoUrl !== 'mock') {
          try { await this.downloadFile(videoUrl, videoPath); } catch (e: any) { throw new Error(`第 ${scene.id} 幕影片下載失敗: ${e.message}`); }
      } else { await this.generateAiVideoMock(videoPath); }

      const targetDur = Math.max(audioDur, 2.5);
      const sceneAssets = [{ video: videoPath, audio: audioPath, duration: targetDur, text: cleanNarration }];
      const subSettings = { fontSize: config?.fontSize ?? 60, subtitleColor: config?.subtitleColor || '#FFFF00', fontName: config?.fontName || 'NotoSansTC-Bold.ttf' };
      const assPath = this.generateSubtitles(sceneAssets, subSettings);
      const { fontsDirEscaped, assPathEscaped } = await this.setupFonts(assPath, subSettings.fontName);

      return new Promise((resolve, reject) => {
          ffmpeg()
              .input(videoPath)
              .input(audioPath)
              .complexFilter([
                  // 🚀 核心升級：動態模糊背景引擎 (Blurred Background)
                  // 1. 將影片複製為兩份：一份做背景(bg_src)，一份做前景(fg_src)
                  `[0:v]split=2[bg_src][fg_src]`,
                  // 2. 背景處理：強制放大填滿 9:16，裁切多餘部分，並加上強度為 25 的高斯模糊
                  `[bg_src]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=luma_radius=25:luma_power=25[bg]`,
                  // 3. 前景處理：等比例縮小以確保完整顯示在 720 寬度內
                  `[fg_src]scale=720:1280:force_original_aspect_ratio=decrease[fg]`,
                  // 4. 將前景疊加到模糊背景的正中央，並設定時長與幀率
                  `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=15,trim=duration=${targetDur.toFixed(3)},setpts=PTS-STARTPTS[v_merged]`,
                  // 5. 壓上字幕
                  `[v_merged]ass=${assPathEscaped}:fontsdir=${fontsDirEscaped}[v_sub]`
              ])
              .outputOptions([
                  '-map [v_sub]', '-map 1:a',
                  '-c:v libx264', '-preset ultrafast', '-crf 28', '-pix_fmt yuv420p',
                  '-c:a aac', '-ar 44100', '-ac 2', '-shortest'
              ])
              .output(outputPath)
              .on('end', () => resolve(outputPath))
              .on('error', (err) => reject(new Error(`Chunk FFmpeg: ${err.message}`)))
              .run();
      });
  }

  async stitchFinal(chunkUrls: string[], config: any, outputPath: string): Promise<string> {
      const localPaths: string[] = [];
      const durations: number[] = [];

      await Promise.all(chunkUrls.map(async (url, i) => {
          const p = path.join(this.tempDir, `chunk_${i}.mp4`);
          await this.downloadFile(url, p);
          localPaths[i] = p;
      }));

      for (let i = 0; i < localPaths.length; i++) {
          durations[i] = await this.getDuration(localPaths[i]);
      }

      const bgmMood = config?.bgmMood || 'none';
      const bgmVolume = config?.bgmVolume ?? 0.1;
      const bgmPath = await this.prepareBGM(bgmMood);

      return new Promise((resolve, reject) => {
          const cmd = ffmpeg();
          localPaths.forEach(p => cmd.input(p));
          if (bgmPath) cmd.input(bgmPath);

          if (localPaths.length === 1) {
              if (bgmPath) {
                  cmd.complexFilter([
                      `[1:a]aloop=loop=-1:size=2e+09[bgm_loop]`,
                      `[bgm_loop]volume=${bgmVolume}[bgm_low]`,
                      `[0:a][bgm_low]amix=inputs=2:duration=shortest:dropout_transition=2[a_out]`
                  ]).outputOptions(['-map 0:v', '-map [a_out]', '-c:v copy', '-c:a aac', '-ar 44100', '-ac 2']);
              } else {
                  cmd.outputOptions(['-c copy']);
              }
              cmd.output(outputPath).on('end', () => resolve(outputPath)).on('error', (err) => reject(err)).run();
              return;
          }

          const transitionDuration = 0.5;
          let filterComplex = '';
          let currentOffset = 0;
          let lastV = '0:v';
          let lastA = '0:a';

          for (let i = 1; i < localPaths.length; i++) {
              currentOffset += (durations[i - 1] - transitionDuration);
              const nextV = `v_step${i}`;
              const nextA = `a_step${i}`;
              filterComplex += `[${lastV}][${i}:v]xfade=transition=fade:duration=${transitionDuration}:offset=${currentOffset.toFixed(3)}[${nextV}];`;
              filterComplex += `[${lastA}][${i}:a]acrossfade=d=${transitionDuration}[${nextA}];`;
              lastV = nextV;
              lastA = nextA;
          }

          let finalAudio = `[${lastA}]`;
          if (bgmPath) {
              const bgmIndex = localPaths.length; 
              filterComplex += `[${bgmIndex}:a]aloop=loop=-1:size=2e+09[bgm_loop];`;
              filterComplex += `[bgm_loop]volume=${bgmVolume}[bgm_low];`;
              filterComplex += `[${lastA}][bgm_low]amix=inputs=2:duration=shortest:dropout_transition=2[a_out]`;
              finalAudio = '[a_out]';
          }

          cmd.complexFilter(filterComplex)
             .outputOptions([
                 `-map [${lastV}]`, `-map ${finalAudio}`,
                 '-c:v libx264', '-preset ultrafast', '-crf 28', '-pix_fmt yuv420p',
                 '-c:a aac', '-ar 44100', '-ac 2'
             ])
             .output(outputPath)
             .on('end', () => resolve(outputPath))
             .on('error', (err) => reject(new Error(`Stitch FFmpeg: ${err.message}`)))
             .run();
      });
  }

  private async assembleAvatarPipeline(script: ScriptData, outputFilename: string, settings: any, preGeneratedHeygenUrl?: string): Promise<string> {
      if (!preGeneratedHeygenUrl) throw new Error("未收到預先生成的 HeyGen 影片網址！");
      const singleVideoPath = path.join(this.tempDir, `heygen_full.mp4`);
      await this.downloadFile(preGeneratedHeygenUrl, singleVideoPath);
      let totalDuration = await this.getDuration(singleVideoPath);
      if (totalDuration <= 0) totalDuration = 50; 
      const sceneAssets: any[] = [];
      const totalChars = script.scenes.map(s => s.narration.replace(/[\n\r\s]+/g, '')).join('').length;
      for (const scene of script.scenes) {
          const cleanNarration = scene.narration.replace(/[\n\r]+/g, ' ').trim();
          sceneAssets.push({ video: singleVideoPath, duration: totalDuration * (cleanNarration.replace(/\s+/g, '').length / Math.max(totalChars, 1)), text: cleanNarration });
      }
      const assPath = this.generateSubtitles(sceneAssets, settings);
      const bgmPath = await this.prepareBGM(settings.bgmMood);
      const { fontsDirEscaped, assPathEscaped } = await this.setupFonts(assPath, settings.fontName);
      
      return new Promise((resolve, reject) => {
          const cmd = ffmpeg().input(singleVideoPath);
          const filterComplex = [];
          let aFinal = '0:a';
          if (bgmPath) {
              cmd.input(bgmPath);
              filterComplex.push(`[1:a]aloop=loop=-1:size=2e+09[bgm_loop]`, `[bgm_loop]volume=${settings.bgmVolume}[bgm_low]`, `[bgm_low][0:a]amix=inputs=2:duration=shortest:dropout_transition=2[a_mixed]`);
              aFinal = '[a_mixed]';
          }
          
          // Avatar 模式也套用動態模糊背景機制 (避免 HeyGen 產出 16:9 時破圖)
          filterComplex.push(
              `[0:v]split=2[bg_src][fg_src]`,
              `[bg_src]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=luma_radius=25:luma_power=25[bg]`,
              `[fg_src]scale=720:1280:force_original_aspect_ratio=decrease[fg]`,
              `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[v_merged]`,
              `[v_merged]ass=${assPathEscaped}:fontsdir=${fontsDirEscaped}[v_out]`
          );

          cmd.complexFilter(filterComplex).outputOptions([`-map [v_out]`, `-map ${aFinal}`, '-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-shortest']).output(outputFilename).on('end', () => resolve(outputFilename)).on('error', (err) => reject(new Error(`FFmpeg: ${err.message}`))).run();
      });
  }

  private generateSubtitles(sceneAssets: any[], settings: any): string {
      const assPath = path.join(this.tempDir, `subtitles_${Date.now()}.ass`);
      let assEvents = '', currentTime = 0;
      const formatAssTime = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 100); return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`; };
      const hexToASS = (hex: string) => { const clean = hex.replace('#', ''); return clean.length === 6 ? `&H00${clean.substring(4, 6)}${clean.substring(2, 4)}${clean.substring(0, 2)}` : '&H0000FFFF'; };

      for (const asset of sceneAssets) {
          const durationMs = Math.round(asset.duration * 100), words = asset.text.split(''); 
          let karaokeText = '';
          let charCount = 0;
          
          if (words.length > 0) {
              const charDuration = Math.floor(durationMs / Math.max(words.length, 1));
              words.forEach((w: string) => { 
                  karaokeText += `{\\k${charDuration}}${w}`; 
                  charCount++;
                  if (charCount >= 12 && /[，。！？、,.\s]/.test(w)) {
                      karaokeText += '\\N';
                      charCount = 0;
                  } else if (charCount >= 16) {
                      karaokeText += '\\N';
                      charCount = 0;
                  }
              });
          }
          assEvents += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + asset.duration)},Default,,0,0,0,,${karaokeText}\n`;
          currentTime += asset.duration;
      }
      
      const assHeader = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 1\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans CJK TC,${settings.fontSize},${hexToASS(settings.subtitleColor)},&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,40,40,150,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
      fs.writeFileSync(assPath, '\uFEFF' + assHeader + assEvents, 'utf8');
      return assPath;
  }

  private async setupFonts(assPath: string, fontName: string) {
      const fontConfigDir = path.join(this.tempDir, 'fontconfig');
      const localFontDir = path.join(this.tempDir, 'fonts_cache');
      if (!fs.existsSync(fontConfigDir)) fs.mkdirSync(fontConfigDir, { recursive: true });
      if (!fs.existsSync(localFontDir)) fs.mkdirSync(localFontDir, { recursive: true });

      const destFontPath = path.join(localFontDir, 'NotoSansCJKtc-Bold.otf');

      if (!fs.existsSync(destFontPath)) {
          console.log(`[VideoAssembler] 正在下載中文字體...`);
          try {
              await this.downloadFile('https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf', destFontPath, 30000, 3);
          } catch (e) { console.error("字體下載失敗:", e); }
      }

      const fontsConfPath = path.join(fontConfigDir, 'fonts.conf');
      fs.writeFileSync(fontsConfPath, `<?xml version="1.0"?>\n<fontconfig>\n  <dir>${localFontDir.replace(/\\/g, '/')}</dir>\n  <cachedir>${fontConfigDir.replace(/\\/g, '/')}</cachedir>\n  <config></config>\n</fontconfig>`, 'utf8');
      process.env.FONTCONFIG_PATH = fontConfigDir; 
      process.env.FONTCONFIG_FILE = fontsConfPath;
      
      return { fontsDirEscaped: this.escapeForFfmpeg(localFontDir), assPathEscaped: this.escapeForFfmpeg(assPath) };
  }

  private async prepareBGM(mood: string): Promise<string> {
      if (!mood || mood === 'none') return '';
      const bgmUrl = await this.fetchDynamicBgm(mood);
      if (!bgmUrl) return '';
      const bgmPath = path.join(this.tempDir, `bgm_${Date.now()}.mp3`);
      try { await this.downloadFile(bgmUrl, bgmPath); return bgmPath; } catch (e) { return ''; }
  }
}
