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
    const cleanVoice = voice.trim();
    console.log(`Generating TTS with ${engine} (${cleanVoice})...`);
    
    // 🚀 核心修復：如果指定 ElevenLabs，就絕對不默默降級！有錯直接丟出來！
    if (engine === 'elevenlabs') {
        if (!this.elevenLabsApiKey) throw new Error("ELEVENLABS_API_KEY missing.");
        
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cleanVoice}`, {
            method: 'POST', 
            headers: { 
                'xi-api-key': this.elevenLabsApiKey, 
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({ 
                text: text, 
                model_id: 'eleven_multilingual_v2', 
                voice_settings: { stability: 0.5, similarity_boost: 0.75 } 
            }),
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`ElevenLabs 拒絕請求: ${errText}`); // 讓組裝廠抓到這個錯誤
        }
        
        fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
        return null; 
    } 

    // 原本的 Edge TTS 邏輯
    try {
        const langCode = cleanVoice.split('-').slice(0, 2).join('-');
        const tts = new EdgeTTS({ voice: cleanVoice, lang: langCode, outputFormat: 'audio-24khz-96kbitrate-mono-mp3', saveSubtitles: true, rate: '+25%' });
        await tts.ttsPromise(text, outputPath);
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) throw new Error(`Edge TTS 生成空檔案`);
        return null;
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
