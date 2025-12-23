
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
 * Veo 3.1 影片生成服務 (最佳化配額版)
 */
export const generateVideo = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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

    // 1. 首段盲等 120 秒
    await new Promise(resolve => setTimeout(resolve, 120000));

    let attempts = 0;
    const MAX_POLLING_ATTEMPTS = 15; // 15 * 30s = 450s (7.5 min)
    
    while (!operation.done && attempts < MAX_POLLING_ATTEMPTS) {
      // 2. 30 秒查詢一次
      await new Promise(resolve => setTimeout(resolve, 30000));
      try {
        operation = await ai.operations.getVideosOperation({operation: operation});
      } catch (e: any) {
        if (e.message.includes("429")) {
          await new Promise(resolve => setTimeout(resolve, 60000));
          continue;
        }
        throw e;
      }
      attempts++;
    }

    if (!operation.done) {
        throw new Error("Veo 渲染超時，請檢查 Google AI Studio 任務狀態。");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Veo 未能產出影片下載連結。");

    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!response.ok) throw new Error("影片下載失敗。");

    const arrayBuffer = await response.arrayBuffer();
    return `data:video/mp4;base64,${Buffer.from(arrayBuffer).toString('base64')}`;

  } catch (error: any) {
    console.error("[Veo Engine Error]:", error);
    throw new Error(`影片渲染失敗: ${error.message}`);
  }
};
