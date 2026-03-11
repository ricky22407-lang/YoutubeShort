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

  private async downloadFile(url: string, dest: string, timeoutMs: number = 60000): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    } catch (e: any) { throw e; } finally { clearTimeout(timeoutId); }
  }

  private async fetchDynamicBgm(mood: string): Promise<string> {
      if (!mood || mood === 'none') return '';
      const moodMap: Record<string, string> = { emotional: '1REsVuxpadReul7F5h4RzfbfWqYgdsd56', energetic: '1BRyzqjynpi_WOudMNuCt8Hd-XZVP4olT', funny: '1ehNbDhxPRwQ2-G3RaCrtrpFCCvsJXBdt', Relaxing: '15oNe3ymR3iI_o7a-yLsMWq2qRJLoojaQ', Happy: '11yLdyL-swvjnX5SIHt4UU_ta5BkZ2J5Y', Chill: '1Z7TTsCMzrFY92jo4H9UmOM6rV5jjQnwF', Epic: '1g4PCrYnwsODXb6nxZrTxFpJ4HXsA3PEn' };
      let folderId = moodMap[mood] || moodMap['random'];
      if (mood === 'random') folderId = moodMap[Object.keys(moodMap)[Math.floor(Math.random() * Object.keys(moodMap).length)]];
      if (!folderId) return '';
      try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&key=${process.env.GOOGLE_DRIVE_API_KEY}`);
          if (!res.ok) return '';
          const files = (await res.json()).files || [];
          if (files.length > 0) return `https://drive.google.com/uc?export=download&id=${files[Math.floor(Math.random() * files.length)].id}`;
      } catch (error) {}
      return '';
  }

  private async generateAiVideoMock(outputPath: string): Promise<void> {
      return new Promise((resolve, reject) => { ffmpeg().input('color=c=black:s=720x1280').inputFormat('lavfi').duration(5).output(outputPath).on('end', () => resolve()).on('error', reject).run(); });
  }

  async assemble(videoType: string, script: ScriptData, outputFilename: string, config?: any, preGeneratedHeygenUrl?: string, preGeneratedSceneUrls?: Record<number, string>): Promise<string> {
      const commonSettings = { bgmVolume: config?.bgmVolume ?? 0.1, fontSize: config?.fontSize ?? 80, subtitleColor: config?.subtitleColor || '#FFFF00', fontName: config?.fontName || 'NotoSansTC-Bold.ttf', voiceId: config?.ttsEngine === 'elevenlabs' && config?.elevenLabsVoiceId ? config.elevenLabsVoiceId : (config?.voiceId || 'zh-TW-HsiaoChenNeural'), bgmMood: config?.bgmMood || 'none' };
      if (videoType === 'avatar') return this.assembleAvatarPipeline(script, outputFilename, commonSettings, preGeneratedHeygenUrl);
      else return this.assembleSceneBasedPipeline(script, outputFilename, commonSettings, preGeneratedSceneUrls);
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

      return new Promise((resolve, reject) => {
          const { fontsDirEscaped, assPathEscaped } = this.setupFonts(assPath, settings.fontName);
          const cmd = ffmpeg().input(singleVideoPath);
          const filterComplex = [];
          let aFinal = '0:a';

          if (bgmPath) {
              cmd.input(bgmPath);
              filterComplex.push(`[1:a]aloop=loop=-1:size=2e+09[bgm_loop]`, `[bgm_loop]volume=${settings.bgmVolume}[bgm_low]`, `[bgm_low][0:a]amix=inputs=2:duration=shortest:dropout_transition=2[a_mixed]`);
              aFinal = '[a_mixed]';
          }
          filterComplex.push(`[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,format=yuv420p,ass=${assPathEscaped}:fontsdir=${fontsDirEscaped}[v_out]`);
          cmd.complexFilter(filterComplex).outputOptions([`-map [v_out]`, `-map ${aFinal}`, '-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-shortest']).output(outputFilename).on('end', () => resolve(outputFilename)).on('error', (err) => reject(new Error(`FFmpeg 失敗: ${err.message}`))).run();
      });
  }

  private async assembleSceneBasedPipeline(script: ScriptData, outputFilename: string, settings: any, preGeneratedSceneUrls?: Record<number, string>): Promise<string> {
      const sceneAssets: any[] = [];
      for (const scene of script.scenes) {
          const audioPath = path.join(this.tempDir, `scene_${scene.id}.mp3`);
          let videoPath = path.join(this.tempDir, `scene_${scene.id}.mp4`);
          const cleanNarration = scene.narration.replace(/[\n\r]+/g, ' ').trim();

          // 🚀 支援「無配音」場景：如果有字就配音，沒字就生 3 秒靜音檔避免崩潰
          let audioDur = 0;
          if (cleanNarration.length > 0) {
              if (!fs.existsSync(audioPath)) await this.ttsService.generateAudio(cleanNarration, audioPath, settings.voiceId);
              audioDur = await this.getDuration(audioPath);
          } else {
              if (!fs.existsSync(audioPath)) {
                  await new Promise<void>((resolve, reject) => { ffmpeg().input('anullsrc').inputFormat('lavfi').outputOptions(['-t 3']).audioCodec('libmp3lame').output(audioPath).on('end', resolve).on('error', reject).run(); });
              }
              audioDur = 3;
          }

          if (!fs.existsSync(videoPath)) {
              if (preGeneratedSceneUrls && preGeneratedSceneUrls[scene.id] && preGeneratedSceneUrls[scene.id] !== 'mock') {
                  await this.downloadFile(preGeneratedSceneUrls[scene.id], videoPath);
              } else { await this.generateAiVideoMock(videoPath); }
          }
          sceneAssets.push({ video: videoPath, audio: audioPath, duration: Math.max(audioDur, 2.5), text: cleanNarration });
      }

      const assPath = this.generateSubtitles(sceneAssets, settings);
      const bgmPath = await this.prepareBGM(settings.bgmMood);

      return new Promise((resolve, reject) => {
          const { fontsDirEscaped, assPathEscaped } = this.setupFonts(assPath, settings.fontName);
          const cmd = ffmpeg();
          const filterComplex: string[] = [];
          
          sceneAssets.forEach(a => cmd.input(a.video));
          sceneAssets.forEach(a => cmd.input(a.audio));
          if (bgmPath) cmd.input(bgmPath);

          const videoOutputs: string[] = [], audioOutputs: string[] = [];
          sceneAssets.forEach((asset, i) => { 
              filterComplex.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration=15,trim=duration=${asset.duration.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`); 
              videoOutputs.push(`[v${i}]`); 
          });
          filterComplex.push(`${videoOutputs.join('')}concat=n=${sceneAssets.length}:v=1:a=0[v_concat]`);

          const ttsStartIndex = sceneAssets.length;
          for(let i=0; i<sceneAssets.length; i++) audioOutputs.push(`[${ttsStartIndex + i}:a]`);
          filterComplex.push(`${audioOutputs.join('')}concat=n=${sceneAssets.length}:v=0:a=1[a_tts]`);

          let aFinal = '[a_tts]';
          if (bgmPath) {
              const bgmIndex = ttsStartIndex + sceneAssets.length;
              filterComplex.push(`[${bgmIndex}:a]aloop=loop=-1:size=2e+09[bgm_loop]`, `[bgm_loop]volume=${settings.bgmVolume}[bgm_low]`, `[bgm_low][a_tts]amix=inputs=2:duration=shortest:dropout_transition=2[a_mixed]`);
              aFinal = '[a_mixed]';
          }

          filterComplex.push(`[v_concat]ass=${assPathEscaped}:fontsdir=${fontsDirEscaped}[v_out]`);
          cmd.complexFilter(filterComplex).outputOptions([`-map [v_out]`, `-map ${aFinal}`, '-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-shortest']).output(outputFilename).on('end', () => resolve(outputFilename)).on('error', (err) => reject(new Error(`FFmpeg 組裝失敗: ${err.message}`))).run();
      });
  }

  private generateSubtitles(sceneAssets: any[], settings: any): string {
      const assPath = path.join(this.tempDir, 'subtitles.ass');
      let assEvents = '', currentTime = 0;
      const formatAssTime = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 100); return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`; };
      const hexToASS = (hex: string) => { const clean = hex.replace('#', ''); return clean.length === 6 ? `&H00${clean.substring(4, 6)}${clean.substring(2, 4)}${clean.substring(0, 2)}` : '&H0000FFFF'; };

      for (const asset of sceneAssets) {
          const durationMs = Math.round(asset.duration * 100), words = asset.text.split(''); 
          let karaokeText = '';
          if (words.length > 0) {
              const charDuration = Math.floor(durationMs / Math.max(words.length, 1));
              words.forEach((w: string) => { karaokeText += `{\\k${charDuration}}${w}`; });
          }
          assEvents += `Dialogue: 0,${formatAssTime(currentTime)},${formatAssTime(currentTime + asset.duration)},Default,,0,0,0,,${karaokeText}\n`;
          currentTime += asset.duration;
      }
      const fontMap: Record<string, string> = { 'NotoSansTC-Bold.ttf': 'Noto Sans TC', 'NotoSerifTC-Bold.ttf': 'Noto Serif TC', 'ZCOOLKuaiLe-Regular.ttf': 'ZCOOL KuaiLe', 'Roboto-Bold.ttf': 'Roboto', 'Anton-Regular.ttf': 'Anton', 'Bangers-Regular.ttf': 'Bangers' };
      
      // 🚀 字幕解析度大修正：對齊影片實際的 720x1280，並將 MarginV 設為 150，確保不會飛到螢幕外！
      const assHeader = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontMap[settings.fontName] || 'Noto Sans TC'},${settings.fontSize},${hexToASS(settings.subtitleColor)},&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,20,20,150,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
      fs.writeFileSync(assPath, '\uFEFF' + assHeader + assEvents, 'utf8');
      return assPath;
  }

  private setupFonts(assPath: string, fontName: string) {
      const fontConfigDir = path.join(this.tempDir, 'fontconfig'), localFontDir = path.join(this.tempDir, 'fonts_cache');
      if (!fs.existsSync(fontConfigDir)) fs.mkdirSync(fontConfigDir, { recursive: true });
      if (!fs.existsSync(localFontDir)) fs.mkdirSync(localFontDir, { recursive: true });
      let systemFontDir = path.join(process.cwd(), 'fonts');
      if (!fs.existsSync(systemFontDir)) systemFontDir = path.join(__dirname, '../fonts');
      if (!fs.existsSync(systemFontDir)) systemFontDir = path.join(__dirname, '../../fonts');
      const sourceFontPath = path.join(systemFontDir, fontName), destFontPath = path.join(localFontDir, fontName);
      if (fs.existsSync(sourceFontPath)) fs.copyFileSync(sourceFontPath, destFontPath);
      const fontsConfPath = path.join(fontConfigDir, 'fonts.conf');
      fs.writeFileSync(fontsConfPath, `<?xml version="1.0"?>\n<fontconfig>\n  <dir>${localFontDir.replace(/\\/g, '/')}</dir>\n  <cachedir>${fontConfigDir.replace(/\\/g, '/')}</cachedir>\n  <config></config>\n</fontconfig>`, 'utf8');
      process.env.FONTCONFIG_PATH = fontConfigDir; process.env.FONTCONFIG_FILE = fontsConfPath;
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
