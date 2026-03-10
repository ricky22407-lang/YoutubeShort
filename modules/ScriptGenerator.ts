import { GoogleGenAI, Type } from "@google/genai";
import { ScriptData } from "../types.js";

export class ScriptGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(topic: string, language: string = "zh-TW", referenceImage?: string | null): Promise<ScriptData> {
    console.log(`[ScriptGenerator] 正在生成腳本, 主題: ${topic}, 語言: ${language}`);
    
    let imageContext = "";
    if (referenceImage) {
        imageContext = "The user has provided a reference image for the product/subject. Ensure the script highlights its visible features and uses it as the core subject in visual cues.";
    }

    // 🚀 核心優化：針對 Veo/Sora 影片引擎的 Prompt Engineering 強化
    const prompt = `
      You are an expert viral YouTube Shorts scriptwriter and an AI Video Prompt Engineer.
      Create a viral short video script based on this topic: ${topic}.
      ${imageContext}

      【CRITICAL: AI VIDEO GENERATION CONSTRAINTS】
      The 'visual_cue' field will be sent directly to AI video generators (like Google Veo) to generate clips sequentially. To prevent visual inconsistency and product distortion across cuts, you MUST follow these rules for EVERY visual_cue:
      1. SUBJECT LOCK: Always describe the core product/subject in detail in every scene. Do not use pronouns like "it" or "the bottle". Use explicit descriptions (e.g., "a white spray bottle with SMELL BLOCKER text").
      2. GLOBAL STYLE: Append a consistent cinematic style to the end of every visual cue to maintain color grading (e.g., ", cinematic lighting, 4k resolution, highly detailed").
      3. AVOID JUMP CUTS: AI struggles with complex camera movements. Keep actions simple, continuous, and focused on the subject.

      Language: ${language}.
      Output MUST be a JSON object strictly matching this schema:
      {
        "title": "A highly engaging title",
        "hook": "The opening sentence to grab attention in 3 seconds",
        "scenes": [
          {
            "id": 1,
            "narration": "The spoken text for this scene.",
            "visual_cue": "Detailed AI video prompt following the constraints above."
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
    
    // 清理 markdown 標籤
    const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJson);
    
    return {
        ...data,
        referenceImage: referenceImage || undefined
    };
  }
}
