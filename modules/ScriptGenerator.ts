import { GoogleGenAI, Type } from "@google/genai";
import { ScriptData } from "../types.js";

export class ScriptGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(topic: string, language: string = "zh-TW", referenceImage?: string | null, productDescription?: string, videoType: 'avatar' | 'product' | 'topic' = 'topic'): Promise<ScriptData> {
    console.log(`[ScriptGenerator] 生成腳本, 主題: ${topic}, 語言: ${language}, 類型: ${videoType}`);

    let systemInstruction = "";

    // 🚀 核心重構：針對三種影片類型，給予完全不同的提示詞策略
    if (videoType === 'avatar') {
        systemInstruction = `
        【AVATAR PRESENTER MODE (數字人演講模式)】
        You are an expert scriptwriter for AI Avatar (digital human) videos. Your goal is to write a highly engaging, conversational script.
        - 'narration' (配音): Must be fast-paced, hook the viewer in the first 3 seconds, and sound like a passionate YouTuber speaking directly to the camera. Use spoken language, not formal writing.
        - 'visual_cue' (畫面提示): Since the visual is just an avatar talking, KEEP THIS VERY SIMPLE. Describe the emotion, hand gestures, or what text/emoji should pop up on the screen (e.g., "Excited expression, text pops up: 'SECRET!'"). Do NOT write complex cinematic scene changes.
        `;
    } else if (videoType === 'product') {
        let productContext = referenceImage ? "The user provided a product reference image." : "Focus on the product details.";
        if (productDescription) {
            productContext += `\n【CRITICAL: PRODUCT PHYSICAL DETAILS】\nThe user strictly specified: "${productDescription}". You MUST STRICTLY incorporate these exact physical mechanisms into EVERY 'visual_cue'. Do NOT invent default mechanisms (e.g., if they say "trigger spray", never write "push down pump").`;
        }
        systemInstruction = `
        【COMMERCIAL PRODUCT MODE (產品實拍廣告模式)】
        You are an elite commercial director.
        ${productContext}
        - 'visual_cue' (畫面提示): You are writing prompts for an AI Video Generator. You MUST lock the product subject. Always explicitly describe the product in every scene (do not use pronouns like "it"). Add cinematic styles (e.g., "cinematic lighting, macro shot, 4k, highly detailed"). Focus on the product being used or displayed. AVOID complex jump cuts.
        - 'narration' (配音): Focus on selling points, sensory details, solving pain points, and a strong Call to Action.
        `;
    } else {
        systemInstruction = `
        【VIRAL TOPIC MODE (主題科普拼接模式)】
        You are an expert viral YouTube Shorts creator.
        - 'visual_cue' (畫面提示): Write prompts for an AI Video Generator to create visually striking B-roll footage that matches the narration (e.g., "A cinematic drone shot over a neon-lit cyberpunk city, 4k resolution"). Keep actions simple and continuous.
        - 'narration' (配音): Informative, engaging, fast-paced storytelling.
        `;
    }

    const prompt = `
      ${systemInstruction}

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
            "visual_cue": "Instruction based on the current mode."
          }
        ],
        "socialMediaCopy": {
            "title": "SEO optimized title",
            "description": "Hashtags and description"
        }
      }
    `;

    const response = await this.ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    hook: { type: Type.STRING },
                    scenes: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                narration: { type: Type.STRING },
                                visual_cue: { type: Type.STRING }
                            },
                            required: ["id", "narration", "visual_cue"]
                        }
                    },
                    socialMediaCopy: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            description: { type: Type.STRING }
                        },
                        required: ["title", "description"]
                    }
                },
                required: ["title", "hook", "scenes", "socialMediaCopy"]
            }
        }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Failed to generate script");
    
    const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJson);
    
    return {
        ...data,
        referenceImage: referenceImage || undefined
    };
  }
}
