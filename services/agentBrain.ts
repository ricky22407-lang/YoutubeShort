
import { AgentMemory, CharacterProfile, VideoLog, ShortsData } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const MODEL_ID = "gemini-3-flash-preview";

export const AgentBrain = {
  
  initMemory(): AgentMemory {
    // 預設給予一些假歷史資料，以便展示復盤功能
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
    
    // 將記憶數據格式化給 AI
    const recentHistory = memory.history.slice(0, 5).map(h => 
      `- ${h.topic} [${h.category.toUpperCase()}]: ${h.stats?.views || 0} views`
    ).join('\n');

    // 將當前的策略權重格式化給 AI
    const strategyContext = Object.entries(memory.strategy_bias)
        .map(([cat, weight]) => `${cat.toUpperCase()}: ${(weight * 100).toFixed(0)}% priority`)
        .join(', ');

    const trendKeywords = trends.map(t => t.title).join(', ');

    const prompt = `
      You are an autonomous AI Manager for a Virtual Idol.
      
      === 👤 ARTIST PROFILE ===
      Name: ${profile.name}
      Niche: ${profile.contentFocus}
      Personality: ${profile.personality}
      Constraints: ${profile.constraints}
      
      === 📊 PERFORMANCE DATA (REINFORCEMENT LEARNING) ===
      Current Strategy Weights: ${strategyContext}
      Recent Performance:
      ${recentHistory}
      
      *INSTRUCTION*: Pay attention to the weights. If 'DANCE' has high weight (e.g. > 40%), it means the audience loves it. Prioritize it.
      
      === 📈 MARKET TRENDS ===
      ${trendKeywords}
      
      === TASK ===
      Generate the NEXT viral video concept.
      
      LOGIC:
      1. Analyze trends.
      2. **CROSS-REFERENCE WITH PERFORMANCE**: If previous videos of a certain category failed (low views), avoid that category unless you have a twist. If they succeeded, double down.
      3. **OOTD**: Match outfit to context.
      
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
            reasoning: { type: Type.STRING, description: "Explain decision based on past performance data" },
            visual_style: { type: Type.STRING },
            outfit_idea: { type: Type.STRING },
            hairstyle_idea: { type: Type.STRING }
          },
          required: ["topic", "category", "reasoning", "visual_style", "outfit_idea", "hairstyle_idea"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  },

  /**
   * 成效復盤 (Reinforcement Learning Step)
   * 根據歷史影片的觀看數，重新分配策略權重
   */
  async reflect(memory: AgentMemory): Promise<AgentMemory> {
     const history = memory.history;
     if (history.length === 0) return memory;

     // 1. 計算各類別平均觀看數
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

     // 2. 計算加權分數
     let totalScore = 0;
     const scores: Record<string, number> = {};

     // 基底分數 (避免冷門類別歸零)
     const BASE_SCORE = 1000; 

     Object.keys(categoryStats).forEach(cat => {
         const { totalViews, count } = categoryStats[cat];
         const avgViews = count > 0 ? totalViews / count : 0;
         // 分數 = 平均觀看 + 基底
         scores[cat] = avgViews + BASE_SCORE; 
         totalScore += scores[cat];
     });

     // 3. 正規化為百分比 (0.0 - 1.0)
     const newBias = {
         dance: Number((scores['dance'] / totalScore).toFixed(2)),
         vlog: Number((scores['vlog'] / totalScore).toFixed(2)),
         skit: Number((scores['skit'] / totalScore).toFixed(2)),
         challenge: Number((scores['challenge'] / totalScore).toFixed(2))
     };
     
     // 修正誤差 (確保加總為 1)
     const sum = Object.values(newBias).reduce((a, b) => a + b, 0);
     if (sum !== 1) {
         newBias.dance += (1 - sum); // 灌給 dance
     }

     return {
         ...memory,
         strategy_bias: newBias
     };
  }
};
