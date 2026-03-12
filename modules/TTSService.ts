import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
// @ts-ignore
import { EdgeTTS } from 'node-edge-tts'; 
import ffprobePath from '@ffprobe-installer/ffprobe';

const execPromise = util.promisify(exec);

export class TTSService {
  private outputDir: string;
  private elevenLabsApiKey: string | undefined;

  constructor() {
    this.outputDir = path.join(os.tmpdir(), 'tts_temp');
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  }

  async generateAudio(text: string, outputPath: string, voice: string = 'zh-TW-HsiaoChenNeural', engine: 'edge' | 'elevenlabs' = 'edge'): Promise<string | null> {
    // 🚀 核心修復：強力清除 Voice ID 的任何隱形空白
    const cleanVoice = voice.trim();
    console.log(`Generating TTS with ${engine} (${cleanVoice})...`);
    
    try {
        if (engine === 'elevenlabs') {
            if (!this.elevenLabsApiKey) throw new Error("ELEVENLABS_API_KEY missing.");
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cleanVoice}`, {
                method: 'POST', headers: { 'xi-api-key': this.elevenLabsApiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
            });
            
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`ElevenLabs API Error (${response.status}): ${errText}`);
            }
            fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
            return null; 
        } else {
            const langCode = cleanVoice.split('-').slice(0, 2).join('-');
            const tts = new EdgeTTS({
                voice: cleanVoice, lang: langCode, outputFormat: 'audio-24khz-96kbitrate-mono-mp3', saveSubtitles: true, rate: '+25%'
            });
            await tts.ttsPromise(text, outputPath);
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) throw new Error(`Edge TTS 生成空檔案`);

            const jsonPath = outputPath.replace('.mp3', '.json');
            const vttPath = outputPath.replace('.mp3', '.vtt');
            if (fs.existsSync(jsonPath)) {
                const subData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                const subtitles = Array.isArray(subData) ? subData : [];
                let vttContent = "WEBVTT\n\n";
                const formatTime = (ms: number) => new Date(ms).toISOString().substr(11, 12);
                subtitles.forEach((sub: any) => {
                    if (sub && typeof sub.start === 'number' && typeof sub.end === 'number' && sub.part) {
                         vttContent += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.part}\n\n`;
                    }
                });
                fs.writeFileSync(vttPath, vttContent);
                return vttPath;
            }
            return null;
        }
    } catch (error: any) { 
        console.warn(`[TTS 警告] 預設配音失敗，啟動 Google 備用配音線路: ${error.message}`);
        try {
            const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-TW&client=tw-ob`;
            const fallbackRes = await fetch(fallbackUrl);
            if (!fallbackRes.ok) throw new Error("備用線路也失敗");
            fs.writeFileSync(outputPath, Buffer.from(await fallbackRes.arrayBuffer()));
            return null;
        } catch (fallbackErr) {
            throw new Error(`所有配音引擎皆失效`); 
        }
    }
  }

  async getAudioDuration(filePath: string): Promise<number> {
      try {
          const { stdout } = await execPromise(`"${ffprobePath.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
          return parseFloat(stdout.trim());
      } catch (e) {
          return 3.0;
      }
  }
}
