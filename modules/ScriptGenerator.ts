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
    if (videoType === 'avatar') {
        systemInstruction += " Focus on a charismatic, fast-paced avatar presenter speaking directly to the camera.";
    } else if (videoType === 'product') {
        systemInstruction += ` Focus on a highly engaging commercial. Product details: ${productDescription || 'N/A'}`;
    } else {
        systemInstruction += " Focus on highly engaging B-roll storytelling with voiceover.";
    }

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

  async generate(topic: string, language: string = "zh-TW", referenceImage?: string | null, productDescription?: string, videoType: 'avatar' | 'product' | 'topic' = 'topic', treatment?: any, targetDuration: string = "30", allowNoVoiceover: boolean = false): Promise<ScriptData> {
    console.log(`[ScriptGenerator] 正在依據企劃生成正式腳本...`);

    let systemInstruction = "";
    let treatmentContext = treatment ? `\n【DIRECTOR'S TREATMENT (STRICT ALIGNMENT)】\nYou MUST align the script tightly with this approved treatment:\n- Core Angle: ${treatment.coreAngle}\n- Emotion: ${treatment.targetEmotion}\n- Hook Strategy: ${treatment.hookStrategy}\n- Visual Style: ${treatment.visualStyle}\n` : "";

    // 🛡️ 隔離模式邏輯
    if (videoType === 'avatar') {
        systemInstruction = `【AVATAR PRESENTER MODE】\nYou are an expert scriptwriter for AI Avatar videos. Write a highly engaging, conversational script.\n'narration': Spoken language, fast-paced.\n'visual_cue': Keep it simple and focused on the avatar's performance (e.g., "Excited expression, pointing at the screen"). Do NOT write AI generative video prompts for this mode, as the visual is handled by a talking avatar engine.`;
    } else if (videoType === 'product') {
        let productContext = "Focus on the product details.";
        if (productDescription) productContext += `\n【CRITICAL: PRODUCT DETAILS】\nThe user explicitly stated: "${productDescription}". You MUST incorporate this into the 'visual_cue' whenever the product is shown.`;
        // 🚀 產品防變形運鏡鎖
        systemInstruction = `【COMMERCIAL PRODUCT MODE】\nYou are an elite commercial director. ${productContext}\n'visual_cue': Explicitly describe the product in every scene. \n⚠️ CRITICAL ANTI-DISTORTION RULE: You MUST specify MINIMAL CAMERA MOVEMENT (e.g., 'Static shot', 'Subtle motion', 'Very slow zoom in'). ABSOLUTELY NO '360 pan', 'rotation', or complex dynamic moves, as this causes the AI video generator to deform the product.`;
    } else {
        systemInstruction = `【VIRAL TOPIC MODE】\nYou are a viral Shorts creator.\n'visual_cue': Write prompts for AI B-roll generation matching the narration. Keep actions simple and highly visual.`;
    }

    // ⏱️ 長鏡頭與幕數限制
    const durationMap: Record<string, string> = {
        '10': '10 seconds MAX! STRICTLY 1 SCENE ONLY. Do NOT split into multiple scenes.',
        '15': '15 seconds MAX! MAXIMUM 2 SCENES.',
        '20': '20 seconds MAX! MAXIMUM 2 SCENES.',
        '30': '30 seconds MAX! MAXIMUM 3 SCENES. Make scenes long and continuous.',
        '60': '60 seconds MAX! MAXIMUM 5 SCENES. Make scenes long and continuous.'
    };
    
    let durationRule = `\n【CRITICAL LENGTH & SCENE PACING RULE】 The entire video MUST be strictly ${durationMap[targetDuration] || durationMap['30']}\nTo maintain visual continuity, DO NOT over-cut.`;
    let voiceoverRule = allowNoVoiceover ? `\n【OPTIONAL VOICEOVER】 If a scene does not need voiceover, leave the 'narration' field completely empty ("").` : `\n【MANDATORY VOICEOVER】 Every scene MUST have spoken 'narration'. Do not leave it empty.`;
    let formattingRule = `\n【CRITICAL FORMATTING RULE】 NEVER use brackets like 【】, [], (), or <> in the 'visual_cue' or 'narration'. Write ONLY in plain text.`;
    
    // 🎨 環境光影錨點 (僅限非數字人模式)
    let visualAnchorRule = "";
    if (videoType === 'product' || videoType === 'topic') {
        visualAnchorRule = `\n【CRITICAL VISUAL ANCHOR】 You MUST append this exact phrase to the very end of EVERY 'visual_cue': ", cinematic lighting, consistent color grading, 4k, hyperrealistic". This ensures AI generates a cohesive style across different scenes and angles.`;
    }

    const prompt = `
      ${systemInstruction}
      ${treatmentContext}
      ${durationRule}
      ${voiceoverRule}
      ${formattingRule}
      ${visualAnchorRule}

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
            "visual_cue": "Detailed instruction ${videoType !== 'avatar' ? '+ the mandatory visual anchor phrase' : 'for the avatar behavior'}."
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
    const data = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
    return data;
  }
}
