
import { AgentMemory, CharacterProfile, VideoLog, ShortsData } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const MODEL_ID = "gemini-3-flash-preview";

export const AgentBrain = {
  
  initMemory(): AgentMemory {
    return {
      history: [],
      strategy_bias: { dance: 0.25, vlog: 0.25, skit: 0.25, challenge: 0.25 }
    };
  },

  async think(
    profile: CharacterProfile,
    memory: AgentMemory,
    trends: ShortsData[]
  ): Promise<{ 
      topic: string; 
      category: string; 
      reasoning: string; 
      visual_style: string;
      outfit_idea: string; 
      hairstyle_idea: string;
  }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const recentHistory = memory.history.slice(0, 5).map(h => `- ${h.topic} (${h.category})`).join('\n');
    const trendKeywords = trends.map(t => t.title).join(', ');

    // 構建更豐富的 Prompt，要求 AI 根據場合決定服裝
    const prompt = `
      You are an autonomous AI Manager for a Virtual Idol.
      
      === 👤 ARTIST PROFILE ===
      Name: ${profile.name}
      Age/Occupation: ${profile.age || 'Unknown'}, ${profile.occupation || 'Creator'}
      Personality: ${profile.personality}
      Niche: ${profile.contentFocus}
      
      === ⚠️ CONSTRAINTS ===
      ${profile.constraints}
      
      === 🧠 MEMORY ===
      ${recentHistory || "No previous videos."}
      
      === 📈 TRENDS ===
      ${trendKeywords}
      
      === TASK ===
      Generate the NEXT viral video concept AND the Artist's OOTD (Outfit of the Day).
      
      LOGIC:
      1. Analyze trends but filter through personality.
      2. **OOTD LOGIC**: The outfit MUST match the video context. 
         - If 'Gym Vlog' -> Sportswear/Yoga pants.
         - If 'Cafe Date' -> Cute dress/Casual chic.
         - If 'Dance Challenge' -> Streetwear/Crop top.
         - If 'Bedtime Story' -> Pajamas/Oversized Hoodie.
         - DO NOT retain the same outfit every time. Variety is key for engagement.
      
      Output JSON.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING, description: "Video Title/Concept" },
            category: { type: Type.STRING, enum: ["dance", "vlog", "skit", "challenge"] },
            reasoning: { type: Type.STRING, description: "Why this fits the persona" },
            visual_style: { type: Type.STRING, description: "Camera/Lighting instructions" },
            outfit_idea: { type: Type.STRING, description: "Specific clothing description (e.g., 'Red hoodie and denim shorts')" },
            hairstyle_idea: { type: Type.STRING, description: "Hairstyle description (e.g., 'Messy bun', 'Ponytail', 'Loose waves')" }
          },
          required: ["topic", "category", "reasoning", "visual_style", "outfit_idea", "hairstyle_idea"]
        }
      }
    });

    const decision = JSON.parse(response.text || '{}');
    return decision;
  },

  async reflect(memory: AgentMemory, lastVideoId: string): Promise<AgentMemory> {
     // (Reflection logic remains same for now)
    return memory;
  }
};
