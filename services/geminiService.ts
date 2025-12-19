
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const textModelId = "gemini-3-flash-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

/**
 * 核心 JSON 生成服務
 */
export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  // Fix: Directly use process.env.API_KEY in named parameter to ensure freshness and SDK compliance
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: textModelId,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    // Fix: Access .text property as a getter, not a method
    const text = response.text;
    if (!text) throw new Error("Gemini 回傳內容為空。");

    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as T;
  } catch (error: any) {
    console.error("[Gemini Text Error]:", error);
    throw new Error(`AI 推理失敗: ${error.message}`);
  }
};

/**
 * Veo 3.1 影片生成服務 (垂直 9:16)
 */
export const generateVideo = async (prompt: string): Promise<string> => {
  // Fix: Directly use process.env.API_KEY in named parameter for Veo models
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Fix: Standard timeout for video generation (up to 10 minutes)
  const MAX_POLLING_ATTEMPTS = 60; 

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

    let attempts = 0;
    while (!operation.done && attempts < MAX_POLLING_ATTEMPTS) {
      // Fix: Follow guidelines of using 10 second polling intervals for video generation
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      attempts++;
    }

    if (!operation.done) {
        throw new Error("Veo 渲染時間過長，已觸發伺服器保護機制。請重試。");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Veo 未能產出影片下載連結。");

    // Fix: Append API key from process.env.API_KEY to the download URL
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!response.ok) throw new Error("影片下載失敗。");

    const arrayBuffer = await response.arrayBuffer();
    return `data:video/mp4;base64,${Buffer.from(arrayBuffer).toString('base64')}`;

  } catch (error: any) {
    console.error("[Veo Engine Error]:", error);
    throw new Error(`影片渲染失敗: ${error.message}`);
  }
};
