import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
// @ts-ignore (避免 Vercel 抱怨找不到型別宣告檔)
import { EdgeTTS } from 'node-edge-tts'; 
import ffprobePath from '@ffprobe-installer/ffprobe';

const execPromise = util.promisify(exec);

export class TTSService {
  private outputDir: string;
  private elevenLabsApiKey: string | undefined;

  constructor() {
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
            // 👉 正確的 Node.js Edge TTS 原生寫法
            // 自動從 voice 代碼中提取語言 (例如從 zh-TW-HsiaoChenNeural 提取 zh-TW)
            const langCode = voice.split('-').slice(0, 2).join('-');
            
            const tts = new EdgeTTS({
                voice: voice,
                lang: langCode,
                outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
                saveSubtitles: true
            });
            
            await tts.ttsPromise(text, outputPath);
            
            // 防呆檢測：確認聲音檔案真的有生出來
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                throw new Error(`TTS 語音生成失敗或產出了空白檔案 (測試語音: ${voice})`);
            }

            // node-edge-tts 預設會產生 .json 字幕檔，我們要把它轉成 .vtt 讓系統看得懂
            const jsonPath = outputPath.replace('.mp3', '.json');
            const vttPath = outputPath.replace('.mp3', '.vtt');
            
            if (fs.existsSync(jsonPath)) {
                const subData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                // 修正：subData 可能是陣列，也可能是物件
                // node-edge-tts 輸出格式可能是 [{start, end, part}, ...]
                const subtitles = Array.isArray(subData) ? subData : [];

                let vttContent = "WEBVTT\n\n";
                
                // 將毫秒轉換為 VTT 時間格式 (HH:mm:ss.SSS)
                const formatTime = (ms: number) => {
                    const date = new Date(ms);
                    return date.toISOString().substr(11, 12);
                };

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
        console.error(`${engine} TTS Failed:`, error);
        throw error;
    }
  }

  async getAudioDuration(filePath: string): Promise<number> {
      const ffprobe = ffprobePath.path;
      const { stdout } = await execPromise(`"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
      return parseFloat(stdout.trim());
  }
}