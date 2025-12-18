import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

/**
 * Gemini Service
 * Handles core AI interactions for text and video generation.
 */

const getApiKey = () => {
  // Priority: process.env.API_KEY (Server-side)
  // In Vite/Frontend, process.env.API_KEY is often replaced by define in vite.config
  return process.env.API_KEY || '';
};

// Use the latest recommended model names
const textModelId = "gemini-3-flash-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Configuration Error: API_KEY environment variable is not set.");
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
    if (!text) throw new Error("Gemini returned an empty text response.");

    return JSON.parse(text) as T;
  } catch (error: any) {
    console.error("[generateJSON_Error]", error);
    throw new Error(`Gemini Text Gen Failure: ${error.message}`);
  }
};

export const generateVideo = async (prompt: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Configuration Error: API_KEY is required for video generation.");

  const ai = new GoogleGenAI({ apiKey });

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

    // Poll the operation until completion
    while (!operation.done) {
      // Small delay between polls to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Veo operation completed but returned no video URI.");

    // Fetch the raw video bytes from the signed URI
    const res = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!res.ok) throw new Error(`Failed to download generated video: ${res.statusText}`);

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return `data:video/mp4;base64,${base64}`;
  } catch (error: any) {
    console.error("[generateVideo_Error]", error);
    throw new Error(`Veo Generation Failure: ${error.message}`);
  }
};