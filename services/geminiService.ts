import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

// Updated model names as per latest guidelines
const textModelId = "gemini-3-flash-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey) {
    throw new Error("API Key Missing. In production, ensure Vercel Env variables are set.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: textModelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, 
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No text returned from Gemini.");
    }

    return JSON.parse(text) as T;
  } catch (error: any) {
    console.error("Gemini API Error (Text):", error);
    throw new Error(`Text Gen Failed: ${error.message}`);
  }
};

export const generateVideo = async (prompt: string): Promise<string> => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey) {
    throw new Error("API Key Missing for Video Generation.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const TIMEOUT_MS = 110000; // Extend timeout for video generation (Vercel Pro/Teams support longer)

  const generatePromise = async () => {
    try {
      let operation = await ai.models.generateVideos({
        model: videoModelId,
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '9:16'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) {
        throw new Error("Veo returned no video URI.");
      }

      const response = await fetch(`${downloadLink}&key=${apiKey}`);
      if (!response.ok) throw new Error("Failed to download video bytes.");

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      
      return `data:video/mp4;base64,${base64}`;

    } catch (error: any) {
      console.error("Gemini API Error (Video):", error);
      throw new Error(`Veo API Failure: ${error.message}`);
    }
  };

  return Promise.race([
    generatePromise(),
    new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error("Video Generation Timed Out.")), TIMEOUT_MS)
    )
  ]);
};