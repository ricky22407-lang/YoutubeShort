import { GoogleGenAI, Type } from "@google/genai";
import { ScriptData } from "../types.js";

export class ScriptGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateTreatment(topic: string, language: string = "zh-TW", videoType: string = "topic", productDescription?: string, targetDuration: string = "30", allowNoVoiceover: boolean = false): Promise<any> {
    console.log(`[ScriptGenerator] 生成導演企劃, 主題: ${topic}, 類型: ${videoType}, 時長: ${targetDuration}s`);
    
    let systemInstruction = "You are an elite creative director for YouTube Shorts.";
    if (videoType === 'avatar') systemInstruction += " Focus on a charismatic, fast-paced avatar presenter speaking directly to the camera.";
    if (videoType === 'product') systemInstruction += ` Focus on a highly engaging commercial. Product details: ${productDescription || 'N/A'}`;
    if (videoType === 'topic') systemInstruction += " Focus on highly engaging B-roll storytelling with voiceover.";

    let durationPrompt = `Target Video Duration: ${targetDuration} seconds.`;
    let voiceoverPrompt = allowNoVoiceover ? "If the concept works better as a purely visual experience with music, you can plan for NO voiceover." : "Voiceover is REQUIRED for this video.";

    const prompt = `
      ${systemInstruction}
      Topic: ${topic}
      Language: ${language}
      ${durationPrompt}
      ${voiceoverPrompt}

      Task: Create a pre-production treatment (Director's pitch) for a short video.
      Output MUST be a JSON object strictly matching this schema:
      {
        "coreAngle": "The unique angle or perspective of this video",
        "targetEmotion": "The emotion the viewer should feel (e.g., Excited, Curious)",
        "hookStrategy": "How to visually and verbally hook the viewer in the first 3 seconds",
        "visualStyle": "The overall visual tone and pacing"
      }
    `;

    const response = await this.ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { coreAngle: { type: Type.STRING }, targetEmotion: { type: Type.STRING }, hookStrategy: { type: Type.STRING }, visualStyle: { type: Type.STRING } }, required: ["coreAngle", "targetEmotion", "hookStrategy", "visualStyle"] } } });
    const resultText = response.text;
    if (!resultText) throw new Error("Failed to generate treatment");
    return JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
  }

  async generate(topic: string, language: string = "zh-TW", referenceImage?: string | null, productDescription?: string, videoType: 'avatar' | 'product' | 'topic' = 'topic', treatment?: any, targetDuration: string = "30", allowNoVoiceover: boolean = false): Promise<ScriptData> {
    console.log(`[ScriptGenerator] 正在依據企劃生成正式腳本...`);

    let systemInstruction = "";
    let treatmentContext = treatment ? `\n【DIRECTOR'S TREATMENT (STRICT ALIGNMENT)】\nYou MUST align the script tightly with this approved treatment:\n- Core Angle: ${treatment.coreAngle}\n- Emotion: ${treatment.targetEmotion}\n- Hook Strategy: ${treatment.hookStrategy}\n- Visual Style: ${treatment.visualStyle}\n` : "";

    if (videoType === 'avatar') {
        systemInstruction = `【AVATAR PRESENTER MODE】\nYou are an expert scriptwriter for AI Avatar videos. Write a highly engaging, conversational script.\n'narration': Spoken language, fast-paced.\n'visual_cue': Keep it simple (e.g., "Excited expression, text pops up").`;
    } else if (videoType === 'product') {
        let productContext = referenceImage ? "The user provided a product reference image." : "Focus on the product details.";
        if (productDescription) productContext += `\n【CRITICAL: PRODUCT DETAILS】\nThe user explicitly stated: "${productDescription}". You MUST incorporate this into the 'visual_cue' whenever the product is shown.`;
        systemInstruction = `【COMMERCIAL PRODUCT MODE】\nYou are an elite commercial director. ${productContext}\n'visual_cue': Explicitly describe the product in every scene. Add cinematic style keywords.`;
    } else {
        systemInstruction = `【VIRAL TOPIC MODE】\nYou are a viral Shorts creator.\n'visual_cue': Write prompts for AI B-roll generation matching the narration. Keep actions simple.`;
    }

    const durationMap: Record<string, string> = {
        '10': '10 seconds MAX! Total words: 15-25. Extreme fast pacing.',
        '15': '15 seconds MAX! Total words: 25-35. Very fast pacing.',
        '20': '20 seconds MAX! Total words: 35-50. Fast pacing.',
        '30': '30 seconds MAX! Total words: 50-70. Upbeat pacing.',
        '60': '60 seconds MAX! Total words: 130-160. Normal pacing.'
    };
    let durationRule = `\n【CRITICAL LENGTH RULE】 The entire video MUST be strictly ${durationMap[targetDuration] || durationMap['30']}`;
    let voiceoverRule = allowNoVoiceover ? `\n【OPTIONAL VOICEOVER】 If you decide a scene does not need voiceover (purely visual + music), leave the 'narration' field completely empty ("").` : `\n【MANDATORY VOICEOVER】 Every scene MUST have spoken 'narration'. Do not leave it empty.`;

    const prompt = `
      ${systemInstruction}
      ${treatmentContext}
      ${durationRule}
      ${voiceoverRule}

      Topic: ${topic}
      Language: ${language}

      Output MUST be a JSON object strictly matching this schema:
      {
        "title": "A highly engaging title",
        "hook": "The opening sentence to grab attention in 3 seconds",
        "scenes": [
          {
            "id": 1,
            "narration": "The spoken text for this scene (leave empty if no voiceover).",
            "visual_cue": "Detailed instruction based on the current mode."
          }
        ],
        "socialMediaCopy": { "title": "SEO optimized title", "description": "Hashtags and description" }
      }
    `;

    const response = await this.ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, hook: { type: Type.STRING }, scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.INTEGER }, narration: { type: Type.STRING }, visual_cue: { type: Type.STRING } }, required: ["id", "narration", "visual_cue"] } }, socialMediaCopy: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["title", "description"] } }, required: ["title", "hook", "scenes", "socialMediaCopy"] } } });
    const resultText = response.text;
    if (!resultText) throw new Error("Failed to generate script");
    const data = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
    return { ...data, referenceImage: referenceImage || undefined };
  }
}
