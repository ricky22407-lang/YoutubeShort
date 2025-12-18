
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

// Updated model names as per latest guidelines
// For complex text tasks (reasoning, prompt composition), use gemini-3-pro-preview
const textModelId = "gemini-3-pro-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  // Always obtain API key directly from process.env.API_KEY
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key Missing. Please ensure an API key is selected.");
  }

  // Create a new GoogleGenAI instance right before the call
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

    // Access .text property directly (do not call as method)
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
  // Always obtain API key directly from process.env.API_KEY
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key Missing for Video Generation.");
  }

  // Create a new GoogleGenAI instance right before the call
  const ai = new GoogleGenAI({ apiKey });

  const TIMEOUT_MS = 110000; // Extend timeout for video generation

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
        // Wait for 10 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) {
        throw new Error("Veo returned no video URI.");
      }

      // Append API key when fetching from the download link as per guidelines
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
