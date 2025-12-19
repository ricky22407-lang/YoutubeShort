
import { GoogleGenAI } from "@google/genai";
import { Buffer } from 'buffer';

const textModelId = "gemini-3-flash-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

/**
 * 獲取有效的 API Key
 * Fix: Must use process.env.API_KEY exclusively according to SDK guidelines.
 */
const getApiKey = () => {
    const key = process.env.API_KEY;
    if (!key) throw new Error("[GeminiService] 未偵測到 API_KEY 環境變數。");
    return key;
};

/**
 * 核心 JSON 生成服務
 */
export const generateJSON = async <T>(
  prompt: string,
  systemInstruction: string,
  responseSchema?: any
): Promise<T> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

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
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  // Fix: Increased timeout to allow for standard video generation times (minutes)
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
      // Fix: Follow guidelines of using 10 second polling intervals
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      attempts++;
    }

    if (!operation.done) {
        throw new Error("Veo 渲染時間過長，已觸發伺服器保護機制。請重試。");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Veo 未能產出影片下載連結。");

    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) throw new Error("影片下載失敗。");

    const arrayBuffer = await response.arrayBuffer();
    return `data:video/mp4;base64,${Buffer.from(arrayBuffer).toString('base64')}`;

  } catch (error: any) {
    console.error("[Veo Engine Error]:", error);
    throw new Error(`影片渲染失敗: ${error.message}`);
  }
};
