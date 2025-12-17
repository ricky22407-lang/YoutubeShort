import { GoogleGenAI } from "@google/genai";

// Ensure API Key is present
// Note: In Next.js/Vercel, process.env.API_KEY is available on the server side.
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

const textModelId = "gemini-2.5-flash";
const videoModelId = "veo-3.1-fast-generate-preview";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  if (!API_KEY) {
    throw new Error("API Key is missing. Please check server configuration.");
  }

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
  } catch (error) {
    console.error("Gemini API Error (Text):", error);
    throw error;
  }
};

export const generateVideo = async (prompt: string): Promise<string> => {
  if (!API_KEY) {
    throw new Error("API Key is missing.");
  }

  try {
    console.log("Starting Veo generation (Server-Side)...");
    let operation = await ai.models.generateVideos({
      model: videoModelId,
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16'
      }
    });

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      console.log("Polling status:", operation.metadata?.state);
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("Video generation completed but no URI returned.");
    }

    // Fetch the raw MP4 bytes using the API Key
    const response = await fetch(`${downloadLink}&key=${API_KEY}`);
    if (!response.ok) {
      throw new Error(`Failed to download video bytes: ${response.statusText}`);
    }

    // Convert to Base64 Data URI for frontend consumption
    const arrayBuffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to Base64
    // Safe implementation for environments where Buffer might not be globally typed (e.g. Frontend TS config)
    let base64 = '';
    if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
        base64 = (globalThis as any).Buffer.from(arrayBuffer).toString('base64');
    } else {
        // Fallback using standard Web APIs
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
    }
    
    return `data:video/mp4;base64,${base64}`;

  } catch (error) {
    console.error("Gemini API Error (Video):", error);
    throw error;
  }
};