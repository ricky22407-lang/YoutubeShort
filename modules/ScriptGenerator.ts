import { GoogleGenAI, Type } from "@google/genai";
import { ScriptData } from "../types.js";

export class ScriptGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  // 🚀 核心助攻工具：將 Base64 圖片轉為 Gemini 看得懂的格式
  private processImagesForGemini(prompt: string, referenceImages?: string[]): any[] {
      const parts: any[] = [prompt];
      if (referenceImages && referenceImages.length > 0) {
          for (const img of referenceImages) {
              const match = img.match(/^data:(.+);base64,(.+)$/);
              if (match) {
                  parts.push({
                      inlineData: { mimeType: match[1], data: match[2] }
                  });
              }
          }
      }
      return parts;
  }

  async generateTreatment(topic: string, language: string = "zh-TW", videoType: string = "topic", productDescription?: string, targetDuration: string = "30", allowNoVoiceover: boolean = false, referenceImages?: string[]): Promise<any> {
    console.log(`[ScriptGenerator] 生成導演企劃, 主題: ${topic}, 類型: ${videoType}, 時長: ${targetDuration}s, 附帶圖片: ${referenceImages?.length || 0}張`);
    
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

    // 🚀 視覺對齊指令 (企劃階段)
    let visionPrompt = referenceImages && referenceImages.length > 0 ? 
      `\n【CRITICAL: VISUAL ALIGNMENT】 I have attached reference images. You MUST analyze these images carefully. The treatment's concept, core angle, and visual style MUST strictly match the contents of the images (e.g., if there is a dog, the concept must be about a dog, NOT a cat. If there is a specific environment, use it). Do NOT hallucinate contradictory elements.` : "";

    const prompt = `
      ${systemInstruction}
      ${visionPrompt}
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
        // 將文字與圖片打包送給大腦
        contents: this.processImagesForGemini(prompt, referenceImages), 
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

  async generate(topic: string, language: string = "zh-TW", productDescription?: string, videoType: 'avatar' | 'product' | 'topic' = 'topic', treatment?: any, targetDuration: string = "30", allowNoVoiceover: boolean = false, referenceImages?: string[]): Promise<ScriptData> {
    console.log(`[ScriptGenerator] 正在依據企劃與圖片生成正式腳本...`);

    let systemInstruction = "";
    let treatmentContext = treatment ? `\n【DIRECTOR'S TREATMENT (STRICT ALIGNMENT)】\nYou MUST align the script tightly with this approved treatment:\n- Core Angle: ${treatment.coreAngle}\n- Emotion: ${treatment.targetEmotion}\n- Hook Strategy: ${treatment.hookStrategy}\n- Visual Style: ${treatment.visualStyle}\n` : "";

    if (videoType === 'avatar') {
        systemInstruction = `【AVATAR PRESENTER MODE】\nYou are an expert scriptwriter for AI Avatar videos. Write a highly engaging, conversational script.\n'narration': Spoken language, fast-paced.\n'visual_cue': Keep it simple and focused on the avatar's performance.`;
    } else if (videoType === 'product') {
        let productContext = "Focus on the product details.";
        if (productDescription) productContext += `\n【CRITICAL: PRODUCT DETAILS】\nThe user explicitly stated: "${productDescription}". You MUST incorporate this into the 'visual_cue' whenever the product is shown.`;
        systemInstruction = `【COMMERCIAL PRODUCT MODE】\nYou are an elite commercial director. ${productContext}\n'visual_cue': Explicitly describe the product in every scene. \n⚠️ CRITICAL ANTI-DISTORTION RULE: You MUST specify MINIMAL CAMERA MOVEMENT (e.g., 'Static shot', 'Subtle motion'). ABSOLUTELY NO '360 pan', 'rotation', or complex dynamic moves.`;
    } else {
        systemInstruction = `【VIRAL TOPIC MODE】\nYou are a viral Shorts creator.\n'visual_cue': Write prompts for AI B-roll generation matching the narration. Keep actions simple.`;
    }

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
    
    let visualAnchorRule = "";
    if (videoType === 'product' || videoType === 'topic') {
        visualAnchorRule = `\n【CRITICAL VISUAL ANCHOR】 You MUST append this exact phrase to the very end of EVERY 'visual_cue': ", cinematic lighting, consistent color grading, 4k, hyperrealistic".`;
    }

    // 🚀 視覺對齊指令 (腳本階段)
    let visionPrompt = referenceImages && referenceImages.length > 0 ? 
      `\n【CRITICAL: IMAGE ANALYSIS & STRICT ALIGNMENT】 I have attached ${referenceImages.length} reference image(s). \n1. You MUST analyze what is actually in the images (characters, animals, colors, environment).\n2. Your 'narration' and 'visual_cue' MUST accurately reflect the visual truth of these images (e.g., if the image is a dog, the script MUST be about a dog, NOT a cat).\n3. If there are multiple images, assume they represent different scenes or angles of the same overarching story.` : "";

    const prompt = `
      ${systemInstruction}
      ${treatmentContext}
      ${durationRule}
      ${voiceoverRule}
      ${formattingRule}
      ${visualAnchorRule}
      ${visionPrompt}

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
        // 將文字與圖片打包送給大腦
        contents: this.processImagesForGemini(prompt, referenceImages), 
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
