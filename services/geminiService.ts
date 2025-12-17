import { GoogleGenAI, Type } from "@google/genai";

// Ensure API Key is present
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

const modelId = "gemini-2.5-flash";

export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  if (!API_KEY) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, // Low temperature for deterministic structural output
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No text returned from Gemini.");
    }

    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};