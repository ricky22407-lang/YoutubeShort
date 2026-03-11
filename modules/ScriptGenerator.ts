import { GoogleGenAI, Type } from "@google/genai";
import { ScriptData } from "../types.js";

export class ScriptGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  // 🚀 步驟 1：生成導演企劃書 (Treatment)
  async generateTreatment(topic: string, language: string = "zh-TW", videoType: string = "topic", productDescription?: string): Promise<any> {
    console.log(`[ScriptGenerator] 生成導演企劃, 主題: ${topic}, 類型: ${videoType}`);
    
    let systemInstruction = "You are an elite creative director for YouTube Shorts.";
    if (videoType === 'avatar') systemInstruction += " Focus on a charismatic, fast-paced avatar presenter speaking directly to the camera.";
    if (videoType === 'product') systemInstruction += ` Focus on a highly engaging commercial. Product details: ${productDescription || 'N/A'}`;
    if (videoType === 'topic') systemInstruction += " Focus on highly engaging B-roll storytelling with voiceover.";

    const prompt = `
      ${systemInstruction}
      Topic: ${topic}
      Language: ${language}

      Task: Create a pre-production treatment (Director's pitch) for a 30-60s Short video.
      Output MUST be a JSON object strictly matching this schema:
      {
        "coreAngle": "The unique angle or perspective of this video",
        "targetEmotion": "The emotion the viewer should feel (e.g., Excited, Curious)",
        "hookStrategy": "How to visually and verbally hook the viewer in the first 3 seconds",
        "visualStyle": "The overall visual tone and pacing"
      }
    `;

    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    coreAngle: { type: Type.STRING },
                    targetEmotion: { type: Type.STRING },
                    hookStrategy: { type: Type.STRING },
                    visualStyle: { type: Type.STRING }
                },
                required: ["coreAngle", "targetEmotion", "hookStrategy", "visualStyle"]
            }
        }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Failed to generate treatment");
    return JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
  }

  // 🚀 步驟 2：依照企劃書生成最終腳本
  async generate(topic: string, language: string = "zh-TW", referenceImage?: string | null, productDescription?: string, videoType: 'avatar' | 'product' | 'topic' = 'topic', treatment?: any): Promise<ScriptData> {
    console.log(`[ScriptGenerator] 正在依據企劃生成正式腳本...`);

    let systemInstruction = "";
    let treatmentContext = "";
    
    if (treatment) {
        treatmentContext = `
        【DIRECTOR'S TREATMENT (STRICT ALIGNMENT)】
        You MUST align the script tightly with this approved treatment:
        - Core Angle: ${treatment.coreAngle}
        - Emotion: ${treatment.targetEmotion}
        - Hook Strategy: ${treatment.hookStrategy}
        - Visual Style: ${treatment.visualStyle}
        `;
    }

    if (videoType === 'avatar') {
        systemInstruction = `【AVATAR PRESENTER MODE】\nYou are an expert scriptwriter for AI Avatar videos. Write a highly engaging, conversational script.\n'narration': Spoken language, fast-paced.\n'visual_cue': Keep it simple (e.g., "Excited expression, text pops up").`;
    } else if (videoType === 'product') {
        let productContext = referenceImage ? "The user provided a product reference image." : "Focus on the product details.";
        if (productDescription) productContext += `\n【CRITICAL: PRODUCT DETAILS】\nThe user explicitly stated: "${productDescription}". You MUST incorporate this into the 'visual_cue' whenever the product is shown.`;
        systemInstruction = `【COMMERCIAL PRODUCT MODE】\nYou are an elite commercial director. ${productContext}\n'visual_cue': Explicitly describe the product in every scene. Add cinematic style keywords.`;
    } else {
        systemInstruction = `【VIRAL TOPIC MODE】\nYou are a viral Shorts creator.\n'visual_cue': Write prompts for AI B-roll generation matching the narration. Keep actions simple.`;
    }

    const prompt = `
      ${systemInstruction}
      ${treatmentContext}

      Topic: ${topic}
      Language: ${language}

      Output MUST be a JSON object strictly matching this schema:
      {
        "title": "A highly engaging title",
        "hook": "The opening sentence to grab attention in 3 seconds",
        "scenes": [
          {
            "id": 1,
            "narration": "The spoken text for this scene.",
            "visual_cue": "Detailed instruction based on the current mode."
          }
        ],
        "socialMediaCopy": { "title": "SEO optimized title", "description": "Hashtags and description" }
      }
    `;

    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING }, hook: { type: Type.STRING },
                    scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.INTEGER }, narration: { type: Type.STRING }, visual_cue: { type: Type.STRING } }, required: ["id", "narration", "visual_cue"] } },
                    socialMediaCopy: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["title", "description"] }
                },
                required: ["title", "hook", "scenes", "socialMediaCopy"]
            }
        }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Failed to generate script");
    const data = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
    return { ...data, referenceImage: referenceImage || undefined };
  }
}
