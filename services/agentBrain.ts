
import { AgentMemory, CharacterProfile, VideoLog, ShortsData } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const MODEL_ID = "gemini-3-flash-preview";

export const AgentBrain = {
  
  initMemory(): AgentMemory {
    return {
      history: [
        { videoId: 'm1', timestamp: '2023-10-01', topic: 'My Morning Routine', category: 'vlog', reasoning: 'Intro', stats: { views: 1200, likes: 100, retention: 0.4 } },
        { videoId: 'm2', timestamp: '2023-10-02', topic: 'Doing the Griddy', category: 'dance', reasoning: 'Trend', stats: { views: 50000, likes: 4000, retention: 0.8 } },
        { videoId: 'm3', timestamp: '2023-10-03', topic: 'Spicy Noodle Challenge', category: 'challenge', reasoning: 'Viral', stats: { views: 15000, likes: 1200, retention: 0.6 } },
        { videoId: 'm4', timestamp: '2023-10-05', topic: 'Coding ASMR', category: 'skit', reasoning: 'Niche', stats: { views: 800, likes: 50, retention: 0.2 } },
      ],
      strategy_bias: { dance: 0.25, vlog: 0.25, skit: 0.25, challenge: 0.25 }
    };
  },

  async think(
    profile: CharacterProfile,
    memory: AgentMemory,
    trends: ShortsData[],
    topicHint?: string // 新增：允許外部指定主題
  ): Promise<{ 
      topic: string; 
      category: string; 
      reasoning: string; 
      visual_style: string;
      outfit_idea: string; 
      hairstyle_idea: string;
  }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // 將記憶數據格式化給 AI
    const recentHistory = memory.history.slice(0, 5).map(h => 
      `- ${h.topic} [${h.category.toUpperCase()}]: ${h.stats?.views || 0} views`
    ).join('\n');

    const strategyContext = Object.entries(memory.strategy_bias)
        .map(([cat, weight]) => `${cat.toUpperCase()}: ${(weight * 100).toFixed(0)}% priority`)
        .join(', ');

    const trendKeywords = trends.map(t => t.title).join(', ');
    
    // 如果有使用者指定的主題
    const userInstruction = topicHint 
        ? `USER COMMAND: Focus strictly on the topic "${topicHint}". Generate a viral twist on this specific topic.` 
        : `TASK: Generate the NEXT viral video concept based on trends.`;

    const prompt = `
      You are an autonomous AI Manager for a Virtual Idol.
      
      === 👤 ARTIST PROFILE ===
      Name: ${profile.name}
      Age: ${profile.age || "Young Adult"}
      Gender: ${profile.gender || "Female"}
      Personality: ${profile.personality}
      
      === 📊 DATA ===
      Strategy: ${strategyContext}
      Recent History:
      ${recentHistory}
      Trends: ${trendKeywords}
      
      === 🇹🇼 LOCALIZATION RULE (CRITICAL) ===
      1. **Output Language**: Traditional Chinese (Taiwan/zh-TW).
      2. **Tone**: Natural Taiwanese YouTuber style (use localized terms).
      
      === 🚫 VISUAL CONSTRAINT ===
      1. **NO TEXT/SUBTITLES**: The prompt you generate MUST explicitly say "No text, clean footage".
      2. **OOTD**: Suggest ADULT/MATURE outfits only (unless character is child).
      
      === INSTRUCTION ===
      ${userInstruction}
      
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
            topic: { type: Type.STRING, description: "Video Title in Traditional Chinese" },
            category: { type: Type.STRING, enum: ["dance", "vlog", "skit", "challenge"] },
            reasoning: { type: Type.STRING, description: "Explanation in Traditional Chinese" },
            visual_style: { type: Type.STRING, description: "Detailed visual prompt (keep in English for Veo model compatibility)" },
            outfit_idea: { type: Type.STRING, description: "Outfit description in English (for Model)" },
            hairstyle_idea: { type: Type.STRING, description: "Hairstyle description in English (for Model)" }
          },
          required: ["topic", "category", "reasoning", "visual_style", "outfit_idea", "hairstyle_idea"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  },

  async reflect(memory: AgentMemory): Promise<AgentMemory> {
     const history = memory.history;
     if (history.length === 0) return memory;

     const categoryStats: Record<string, { totalViews: number, count: number }> = {
         dance: { totalViews: 0, count: 0 },
         vlog: { totalViews: 0, count: 0 },
         skit: { totalViews: 0, count: 0 },
         challenge: { totalViews: 0, count: 0 }
     };

     history.forEach(log => {
         if (log.stats && categoryStats[log.category]) {
             categoryStats[log.category].totalViews += log.stats.views;
             categoryStats[log.category].count += 1;
         }
     });

     let totalScore = 0;
     const scores: Record<string, number> = {};
     const BASE_SCORE = 1000; 

     Object.keys(categoryStats).forEach(cat => {
         const { totalViews, count } = categoryStats[cat];
         const avgViews = count > 0 ? totalViews / count : 0;
         scores[cat] = avgViews + BASE_SCORE; 
         totalScore += scores[cat];
     });

     const newBias = {
         dance: Number((scores['dance'] / totalScore).toFixed(2)),
         vlog: Number((scores['vlog'] / totalScore).toFixed(2)),
         skit: Number((scores['skit'] / totalScore).toFixed(2)),
         challenge: Number((scores['challenge'] / totalScore).toFixed(2))
     };
     
     const sum = Object.values(newBias).reduce((a, b) => a + b, 0);
     if (sum !== 1) {
         newBias.dance += (1 - sum); 
     }

     return { ...memory, strategy_bias: newBias };
  },

  async chat(
    profile: CharacterProfile,
    currentPlan: any,
    userMessage: string
  ): Promise<{ reply: string, updatedPlan: any }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      You are "${profile.name}", a Virtual Idol.
      Personality: ${profile.personality}
      
      === 🇹🇼 LOCALIZATION ===
      **Language**: Traditional Chinese (Taiwan).
      **Tone**: Use authentic Taiwanese internet slang if fits personality.
      
      === CURRENT PLAN ===
      ${JSON.stringify(currentPlan, null, 2)}

      === USER FEEDBACK ===
      "${userMessage}"

      === INSTRUCTION ===
      1. Discuss the plan with the user (your producer).
      2. If user wants changes (e.g. "make it cuter"), update the plan fields.
      3. **Visual Integrity**: Even if user says "cute", ensure the updated visual_style/outfit description maintains ADULT proportions in the prompt.
      
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
              reply: { type: Type.STRING, description: "Response in Traditional Chinese" },
              updatedPlan: { 
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  category: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  visual_style: { type: Type.STRING },
                  outfit_idea: { type: Type.STRING },
                  hairstyle_idea: { type: Type.STRING }
                },
                required: ["topic", "category", "reasoning", "visual_style", "outfit_idea", "hairstyle_idea"]
              }
            },
            required: ["reply", "updatedPlan"]
          }
        }
    });

    return JSON.parse(response.text || '{}');
  }
};
