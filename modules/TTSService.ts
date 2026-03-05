import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';

const execPromise = util.promisify(exec);

export class TTSService {
  private outputDir: string;
  private elevenLabsApiKey: string | undefined;

  constructor() {
    // 👉 修復：改用 Vercel 允許寫入的 os.tmpdir()
    this.outputDir = path.join(os.tmpdir(), 'tts_temp');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  }

  async generateAudio(text: string, outputPath: string, voice: string = 'zh-TW-HsiaoChenNeural', engine: 'edge' | 'elevenlabs' = 'edge'): Promise<string | null> {
    console.log(`Generating TTS with ${engine} (${voice})...`);
    
    try {
        if (engine === 'elevenlabs') {
            if (!this.elevenLabsApiKey) {
                throw new Error("ELEVENLABS_API_KEY is missing in environment variables.");
            }
            
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': this.elevenLabsApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    }
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`ElevenLabs API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(outputPath, buffer);
            
            return null; 

        } else {
            // Edge TTS 邏輯
            const safeText = text.replace(/"/g, '\\"');
            const vttPath = outputPath.replace('.mp3', '.vtt');
            const command = `npx edge-tts --voice ${voice} --text "${safeText}" --write-media "${outputPath}" --write-subtitles "${vttPath}"`;
            
            await execPromise(command);
            
            // 👉 強力防呆：如果檔案不存在，或是檔案大小為 0，就立刻報錯攔截，不讓它傳給後面的 FFmpeg
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                throw new Error(`TTS 語音生成失敗或產出了空白檔案 (測試語音: ${voice})`);
            }

            if (fs.existsSync(vttPath)) {
                return vttPath;
            }
            return null;
        }
    } catch (error: any) {
        console.error(`${engine} TTS Failed:`, error);
        throw error;
    }
  }

  async getAudioDuration(filePath: string): Promise<number> {
      const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
      return parseFloat(stdout.trim());
  }
}