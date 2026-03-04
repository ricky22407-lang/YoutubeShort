import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export class TTSService {
  private outputDir: string;
  private elevenLabsApiKey: string | undefined;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'temp');
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
            // ElevenLabs Logic
            // Voice ID is passed as 'voice' argument (e.g., '21m00Tcm4TlvDq8ikWAM')
            // Default model: 'eleven_multilingual_v2' for best Chinese support
            
            // Re-implementing with fetch for maximum control and to avoid library quirks in this environment
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
            
            // ElevenLabs does not natively return VTT. We need to generate it.
            // Option A: Use Whisper to align (Heavy)
            // Option B: Fake it (Linear alignment) - Simple & Fast
            // Since we want "Karaoke", linear alignment is better than nothing.
            // But for now, let's return null for VTT and let VideoAssembler handle fallback (line-level highlight).
            return null; 

        } else {
            // Edge TTS Logic (Default)
            // Escape text for command line
            const safeText = text.replace(/"/g, '\\"');
            const vttPath = outputPath.replace('.mp3', '.vtt');
            // Add --write-subtitles to generate VTT file
            const command = `npx edge-tts --voice ${voice} --text "${safeText}" --write-media "${outputPath}" --write-subtitles "${vttPath}"`;
            
            await execPromise(command);
            
            if (!fs.existsSync(outputPath)) {
                throw new Error("TTS Output file not created");
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

  // Helper to get duration (requires fluent-ffmpeg or similar, but we can just use ffmpeg probe)
  async getAudioDuration(filePath: string): Promise<number> {
      const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
      return parseFloat(stdout.trim());
  }
}
