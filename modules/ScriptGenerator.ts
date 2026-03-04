import { GoogleGenAI, Type } from "@google/genai";
import { ScriptData } from "../types.js";

export class ScriptGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(topic: string, language: 'en' | 'zh-TW' = 'zh-TW'): Promise<ScriptData> {
    const langName = language === 'en' ? 'English' : 'Traditional Chinese (Taiwan)';
    
    const prompt = `
      You are a professional short video scriptwriter.
      Topic: "${topic}"
      Target Audience: General public on YouTube Shorts / TikTok.
      Language: ${langName}

      Generate a structured script for a 30-60 second video.
      
      Requirements:
      1. **Title**: Catchy, viral, clickbait-style.
      2. **Scenes**: Break down the video into 4-6 scenes.
      3. **Narration**: The spoken text for each scene. Keep it punchy and conversational.
      4. **Visual Cues**: A search query (in English) to find relevant stock footage for this scene. e.g., "Drone shot of mountains", "Close up of coffee brewing".
      5. **Keywords**: 5-10 hashtags or keywords.
      6. **BGM Keyword**: A mood or genre for background music (e.g., "Upbeat Lo-Fi", "Cinematic Orchestral").
      7. **Social Media Copy**: Generate metadata for YouTube/Instagram/Facebook.
         - Title: Optimized for clicks.
         - Description: Engaging, includes call to action (CTA).
         - Hashtags: 10-15 relevant tags.

      Return JSON format matching this schema:
      {
        "title": "string",
        "scenes": [
          { "id": 1, "narration": "string", "visual_cue": "string (English)" }
        ],
        "keywords": ["string"],
        "bgmKeyword": "string",
        "socialMediaCopy": {
          "title": "string",
          "description": "string",
          "hashtags": ["string"]
        }
      }
    `;

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
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
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            bgmKeyword: { type: Type.STRING },
            socialMediaCopy: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "description", "hashtags"]
            }
          },
          required: ["title", "scenes", "keywords", "bgmKeyword", "socialMediaCopy"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Failed to generate script");
    
    return JSON.parse(text) as ScriptData;
  }
}
