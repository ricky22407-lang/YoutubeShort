import { TTSService } from './TTSService.js';
import { HeyGenService } from './HeyGenService.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe'; // 👉 新增這行：引入 ffprobe
import fs from 'fs';
import path from 'path';
import os from 'os'; // 確保有 os
import { ScriptData } from '../types.js';
import { searchVideos } from '../services/pexelsService.js';
import { GoogleGenAI } from '@google/genai';
import { finished } from 'stream/promises';
import { Readable } from 'stream';

// Initialize ffmpeg & ffprobe
ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path); // 👉 新增這行：告訴系統 ffprobe 的路徑

export class VideoAssembler {
  private tempDir: string;
  private ttsService: TTSService;
  private heyGenService: HeyGenService;
  private pexelsApiKey: string;
  private ai: GoogleGenAI;

  constructor(apiKey: string, pexelsApiKey: string) {
    // 👉 改用 os.tmpdir() 取得系統合法暫存目錄
    this.tempDir = path.join(os.tmpdir(), `yt_shorts_${Date.now()}`);
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    this.ttsService = new TTSService(apiKey);
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

  private generateAssSubtitles(events: { start: number; end: number; text: string }[], fontSize: number, color: string, fontName: string): string {
    // Map filename to Font Family Name
    const fontMap: Record<string, string> = {
        'NotoSansTC-Bold.ttf': 'Noto Sans TC',
        'NotoSerifTC-Bold.ttf': 'Noto Serif TC',
        'ZCOOLKuaiLe-Regular.ttf': 'ZCOOL KuaiLe',
        'Roboto-Bold.ttf': 'Roboto',
        'Anton-Regular.ttf': 'Anton',
        'Bangers-Regular.ttf': 'Bangers'
    };
    const fontFamily = fontMap[fontName] || 'Arial';

    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},&H00${color.replace('#', '')},&H000000FF,&H00000000,&H80000000,-1,0,1,2,0,2,10,10,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const eventLines = events.map(e => {
      return `Dialogue: 0,${formatTime(e.start)},${formatTime(e.end)},Default,,0,0,0,,${e.text}`;
    }).join('\n');

    return header + eventLines;
  }

  private async fetchDynamicBgm(mood: string): Promise<string> {
      const pixabayKey = process.env.PIXABAY_API_KEY;
      if (!pixabayKey || !mood || mood === 'none') return '';

      const moodMap: Record<string, string> = {
          epic: 'epic cinematic',
          relaxing: 'lofi chill',
          funny: 'funny quirky',
          suspense: 'suspense tension'
      };

      let keyword = moodMap[mood];
      
      if (mood === 'random') {
          const keys = Object.keys(moodMap);
          const randomKey = keys[Math.floor(Math.random() * keys.length)];
          keyword = moodMap[randomKey];
      }

      if (!keyword) return '';

      try {
          console.log(`Fetching BGM from Pixabay (Mood: ${mood}, Keyword: ${keyword})...`);
          // Fetch top 20 popular tracks to ensure variety
          const url = `https://pixabay.com/api/audio/?key=${pixabayKey}&q=${encodeURIComponent(keyword)}&order=popular&per_page=20`;
          
          const res = await fetch(url);
          if (!res.ok) {
              console.warn(`Pixabay API Error: ${res.status} ${res.statusText}`);
              return '';
          }

          const data = await res.json();
          if (data.hits && data.hits.length > 0) {
              // Randomly select one from the results
              const randomHit = data.hits[Math.floor(Math.random() * data.hits.length)];
              // 'audio' field contains the direct download link (usually CDN)
              return randomHit.audio || ''; 
          } else {
              console.warn("Pixabay returned no hits for keyword:", keyword);
          }
      } catch (error) {
          console.error("Failed to fetch BGM from Pixabay:", error);
          // Return empty string to proceed without BGM (fail-safe)
          return '';
      }
      return '';
  }

  async assemble(script: ScriptData, outputFilename: string, config?: { bgmVolume?: number; fontSize?: number; subtitleColor?: string; useStockFootage?: boolean; videoEngine?: 'veo' | 'sora' | 'jimeng' | 'heygen'; ttsEngine?: 'edge' | 'elevenlabs'; elevenLabsVoiceId?: string; voiceId?: string; heygenAvatarId?: string; fontName?: string; bgmMood?: string }, characterProfile?: any): Promise<string> {
    const sceneAssets: { video: string; audio: string; duration: number; text: string }[] = [];
    let totalDuration = 0;
    const bgmVolume = config?.bgmVolume ?? 0.1;
    const fontSize = config?.fontSize ?? 80;
    const useStockFootage = config?.useStockFootage ?? true;
    const videoEngine = config?.videoEngine ?? 'veo';
    const subtitleColor = config?.subtitleColor || '#FFFF00';
    const ttsEngine = config?.ttsEngine || 'edge';
    const fontName = config?.fontName || 'NotoSansTC-Bold.ttf';
    const bgmMood = config?.bgmMood || 'none';
    
    // Determine Voice ID:
    // If ElevenLabs, use elevenLabsVoiceId or fallback to voiceId (which might be generic)
    // If Edge, use voiceId or default
    let voiceId = config?.voiceId || 'zh-TW-HsiaoChenNeural';
    if (ttsEngine === 'elevenlabs' && config?.elevenLabsVoiceId) {
        voiceId = config.elevenLabsVoiceId;
    }

    console.log(`Starting Asset Gathering... Mode: ${useStockFootage ? 'Stock' : 'AI Gen (' + videoEngine + ')'}, TTS: ${ttsEngine} (${voiceId})`);

    // 1. Gather Assets (Audio & Video)
    for (const scene of script.scenes) {
      const sceneId = scene.id;
      
      // Paths
      const audioPath = path.join(this.tempDir, `scene_${sceneId}.mp3`);
      let videoPath = path.join(this.tempDir, `scene_${sceneId}.mp4`);

      // Special Handling for HeyGen (Digital Twin)
      if (videoEngine === 'heygen' && config?.heygenAvatarId) {
          if (!fs.existsSync(videoPath)) {
              console.log(`Generating HeyGen Video for Scene ${sceneId}...`);
              const heyGenUrl = await this.heyGenService.generateVideo(scene.narration, config.heygenAvatarId, voiceId);
              await this.downloadFile(heyGenUrl, videoPath);
          }
          
          // Extract Audio from HeyGen Video for consistency in pipeline (subtitles, mixing)
          if (!fs.existsSync(audioPath)) {
             await new Promise((resolve, reject) => {
                 ffmpeg(videoPath)
                    .output(audioPath)
                    .noVideo()
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
             });
          }
      } else {
          // Standard Flow: TTS + Video Generation/Stock
          
          // A. Audio (TTS)
          if (!fs.existsSync(audioPath)) {
              await this.ttsService.generateAudio(scene.narration, audioPath, voiceId);
          }
          
          // B. Video
          if (!fs.existsSync(videoPath)) {
              if (useStockFootage) {
                  const videoUrls = await searchVideos(scene.visual_cue, this.pexelsApiKey);
                  if (videoUrls.length > 0) {
                    await this.downloadFile(videoUrls[0], videoPath);
                  } else {
                    console.warn(`No video found for "${scene.visual_cue}", falling back to AI generation (${videoEngine}).`);
                    await this.generateAiVideo(scene.visual_cue, videoEngine as any, videoPath, characterProfile);
                  }
              } else {
                  await this.generateAiVideo(scene.visual_cue, videoEngine as any, videoPath, characterProfile);
              }
          }
      }

      const duration = await this.getDuration(audioPath);

      sceneAssets.push({
        video: videoPath,
        audio: audioPath,
        duration: duration,
        text: scene.narration
      });
      totalDuration += duration;
    }

    // 2. Generate Subtitles (ASS)
    const assPath = path.join(this.tempDir, 'subtitles.ass');
    let assEvents = '';
    let currentTime = 0;

    // Helper to parse VTT timestamp (00:00:00.000) to seconds
    const parseVttTime = (timeStr: string): number => {
        const parts = timeStr.split(':');
        const s = parseFloat(parts[2]);
        const m = parseInt(parts[1], 10);
        const h = parseInt(parts[0], 10);
        return h * 3600 + m * 60 + s;
    };

    // Helper to format seconds to ASS timestamp (H:MM:SS.cc)
    const formatAssTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // Helper to convert Hex to ASS BGR format
    const hexToASS = (hex: string) => {
        const clean = hex.replace('#', '');
        if (clean.length === 6) {
            const r = clean.substring(0, 2);
            const g = clean.substring(2, 4);
            const b = clean.substring(4, 6);
            return `&H00${b}${g}${r}`; // Alpha + BGR
        }
        return '&H00FFFF'; // Default Yellow
    };

    for (const asset of sceneAssets) {
        const vttPath = asset.audio.replace('.mp3', '.vtt');
        if (fs.existsSync(vttPath)) {
            const vttContent = fs.readFileSync(vttPath, 'utf-8');
            const lines = vttContent.split('\n');
            let i = 0;
            while (i < lines.length) {
                const line = lines[i].trim();
                // VTT timestamp line: 00:00:00.000 --> 00:00:02.500
                if (line.includes('-->')) {
                    const times = line.split('-->');
                    const start = parseVttTime(times[0].trim());
                    const end = parseVttTime(times[1].trim());
                    const text = lines[i + 1]?.trim(); // Next line is text
                    
                    if (text) {
                        // Adjust time by adding current scene offset
                        const absStart = currentTime + start;
                        const absEnd = currentTime + end;
                        const durationMs = Math.round((end - start) * 100); // centiseconds for \k tag

                        // Karaoke Effect Logic:
                        // Since Edge TTS VTT is usually line-based, not word-based, we simulate word-level highlight
                        // by splitting the sentence and distributing duration.
                        
                        // Estimate word duration:
                        const words = text.split(''); // Character level for Chinese
                        const charDuration = Math.floor(durationMs / words.length);
                        
                        let karaokeText = '';
                        words.forEach(w => {
                            karaokeText += `{\\k${charDuration}}${w}`;
                        });

                        assEvents += `Dialogue: 0,${formatAssTime(absStart)},${formatAssTime(absEnd)},Default,,0,0,0,,${karaokeText}\n`;
                    }
                    i += 2; // Skip time and text lines
                } else {
                    i++;
                }
            }
        } else {
            // Fallback if no VTT (e.g. manual text)
            const start = currentTime;
            const end = currentTime + asset.duration;
            assEvents += `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${asset.text}\n`;
        }
        currentTime += asset.duration;
    }

    // Generate ASS Header with Karaoke Style
    // PrimaryColour: &H00FFFF (Yellow) - Fill color
    // SecondaryColour: &H00FFFFFF (White) - Unfilled color
    // const fontSize = config?.fontSize ?? 80; // Already declared at start of function
    const primaryColor = config?.subtitleColor ? hexToASS(config.subtitleColor) : '&H00FFFF'; // Yellow
    const secondaryColor = '&H00FFFFFF'; // White

    // Map filename to Font Family Name
    const fontMap: Record<string, string> = {
        'NotoSansTC-Bold.ttf': 'Noto Sans TC',
        'NotoSerifTC-Bold.ttf': 'Noto Serif TC',
        'ZCOOLKuaiLe-Regular.ttf': 'ZCOOL KuaiLe',
        'Roboto-Bold.ttf': 'Roboto',
        'Anton-Regular.ttf': 'Anton',
        'Bangers-Regular.ttf': 'Bangers'
    };
    const fontFamily = fontMap[fontName] || 'Arial';

    const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${primaryColor},${secondaryColor},&H000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,20,20,350,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    fs.writeFileSync(assPath, assHeader + assEvents);

    // 3. Assemble Video with FFmpeg (Concatenate + Mix Audio + Burn Subtitles)
    const fileListPath = path.join(this.tempDir, 'files.txt');
    const fileContent = sceneAssets.map(a => `file '${a.video}'\nduration ${a.duration}`).join('\n');
    fs.writeFileSync(fileListPath, fileContent);

    // Concatenate Audio first
    const fullTtsPath = path.join(this.tempDir, 'full_tts.mp3');
    
    // Download BGM if needed
    let bgmPath = '';
    if (bgmMood && bgmMood !== 'none') {
        // Use the new dynamic fetcher
        const bgmUrl = await this.fetchDynamicBgm(bgmMood);
        
        if (bgmUrl) {
            bgmPath = path.join(this.tempDir, `bgm_${Date.now()}.mp3`);
            try {
                console.log(`Downloading BGM (${bgmMood}): ${bgmUrl}`);
                await this.downloadFile(bgmUrl, bgmPath);
            } catch (e) {
                console.error("Failed to download BGM, proceeding without it.", e);
                bgmPath = '';
            }
        } else {
             console.log("No BGM URL returned (or API key missing), proceeding without BGM.");
        }
    }

    // We will build a complex filter command
    return new Promise((resolve, reject) => {
        const cmd = ffmpeg();

        // Inputs
        sceneAssets.forEach(a => {
            cmd.input(a.video);
        });

        // Audio Inputs (TTS)
        sceneAssets.forEach(a => {
            cmd.input(a.audio);
        });

        // BGM Input
        if (bgmPath && fs.existsSync(bgmPath)) {
            cmd.input(bgmPath);
        }

        // Build Filter Complex
        const filterComplex: string[] = [];
        const videoOutputs: string[] = [];
        const audioOutputs: string[] = [];

        // Normalize Video
        sceneAssets.forEach((_, i) => {
            // Scale to 720x1280 (Shorts), Crop if needed
            filterComplex.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[v${i}]`);
            videoOutputs.push(`[v${i}]`);
        });

        // Concat Video
        filterComplex.push(`${videoOutputs.join('')}concat=n=${sceneAssets.length}:v=1:a=0[v_concat]`);

        // Concat Audio (TTS)
        // TTS inputs start at index `sceneAssets.length`
        const ttsStartIndex = sceneAssets.length;
        for(let i=0; i<sceneAssets.length; i++) {
            audioOutputs.push(`[${ttsStartIndex + i}:a]`);
        }
        filterComplex.push(`${audioOutputs.join('')}concat=n=${sceneAssets.length}:v=0:a=1[a_tts]`);

        // Mix BGM
        const bgmIndex = ttsStartIndex + sceneAssets.length;
        if (bgmPath && fs.existsSync(bgmPath)) {
            // Loop BGM and Mix
            filterComplex.push(`[${bgmIndex}:a]aloop=loop=-1:size=2e+09[bgm_loop]`);
            filterComplex.push(`[bgm_loop]volume=${bgmVolume}[bgm_low]`);
            filterComplex.push(`[bgm_low][a_tts]amix=inputs=2:duration=first:dropout_transition=2[a_mixed]`);
        } else {
            filterComplex.push(`[a_tts]anull[a_mixed]`);
        }

        // Burn Subtitles
        // Windows path issue with ASS filter: escape backslashes and colons
        const assPathEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        // Point to fonts directory
        const fontsDir = path.join(process.cwd(), 'fonts');
        const fontsDirEscaped = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
        
        filterComplex.push(`[v_concat]ass='${assPathEscaped}':fontsdir='${fontsDirEscaped}'[v_final]`);

        cmd.complexFilter(filterComplex)
           .outputOptions([
               '-map [v_final]',
               '-map [a_mixed]',
               '-c:v libx264',
               '-pix_fmt yuv420p',
               '-c:a aac',
               '-shortest'
           ])
           .output(outputFilename)
           .on('end', () => {
               console.log('Video Assembly Finished:', outputFilename);
               resolve(outputFilename);
           })
           .on('error', (err) => {
               console.error('FFmpeg Error:', err);
               reject(err);
           })
           .run();
    });
  }

  private async generateAiVideo(prompt: string, engine: 'veo' | 'sora' | 'jimeng', outputPath: string, characterProfile?: any): Promise<void> {
      console.log(`Generating AI Video with ${engine}: ${prompt}`);
      
      let finalPrompt = prompt;
      let imageInput = undefined;

      if (characterProfile) {
          // 1. Text Prompt Enhancement
          const charDetails = [
              characterProfile.name,
              characterProfile.gender,
              characterProfile.age,
              characterProfile.description,
              characterProfile.occupation ? `wearing ${characterProfile.occupation} outfit` : ''
          ].filter(Boolean).join(', ');
          
          finalPrompt = `Character (${charDetails}). ${prompt}`;
          console.log(`Enhanced Prompt: ${finalPrompt}`);

          // 2. Image Input (Prioritize Front View for "Acting")
          // Only use image input if it's a valid Data URI
          const targetImage = characterProfile.images?.front || characterProfile.images?.threeView;
          if (targetImage && typeof targetImage === 'string' && targetImage.startsWith('data:image')) {
              const match = targetImage.match(/^data:(.+);base64,(.+)$/);
              if (match) {
                  imageInput = {
                      mimeType: match[1],
                      imageBytes: match[2]
                  };
                  console.log("Attached Character Reference Image to Veo request.");
              }
          }
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
            while (!operation.done && attempts < 30) { // 2.5 minutes max
                await new Promise(r => setTimeout(r, 5000));
                operation = await this.ai.operations.getVideosOperation({ operation });
                attempts++;
            }

            if (!operation.done || !operation.response?.generatedVideos?.[0]?.video?.uri) {
                throw new Error("Veo Generation Timeout or Failed");
            }

            const videoUri = operation.response.generatedVideos[0].video.uri;
            // Need to fetch with API Key
            const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
            if (!res.ok) throw new Error("Failed to download Veo video");
            
            const fileStream = fs.createWriteStream(outputPath);
            await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
            return;

          } catch (e) {
              console.error("Veo Generation Error:", e);
              // Fallback to placeholder below
          }
      }

      // Fallback / Placeholder for Sora/Jimeng or Failed Veo
      // Generate a video with text using ffmpeg
      return new Promise((resolve, reject) => {
          ffmpeg()
            .input('color=c=black:s=720x1280')
            .inputFormat('lavfi')
            .duration(5)
            .videoFilters([
                `drawtext=text='${engine.toUpperCase()} SIMULATION':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
                `drawtext=text='${finalPrompt.substring(0, 20)}...':fontcolor=yellow:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2+60`
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', reject)
            .run();
      });
  }
}
