import { GoogleGenAI, Modality } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

export class TTSService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateAudio(text: string, outputPath: string, voiceName: string = 'Puck'): Promise<string> {
    // voiceName options: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
    // 'Puck' is a good default male voice, 'Kore' is female.
    
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("TTS generation failed: No audio data returned.");
    }

    const buffer = Buffer.from(base64Audio, 'base64');
    await fs.promises.writeFile(outputPath, buffer);
    return outputPath;
  }
}
