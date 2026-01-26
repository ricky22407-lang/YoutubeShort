
import { AgentMemory, CharacterProfile, VideoLog, ShortsData } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const MODEL_ID = "gemini-3-flash-preview";

/**
 * Agent Brain: 負責「思考」下一部影片要拍什麼
 */
export const AgentBrain = {
  
  /**
   * 初始化記憶體
   */
  initMemory(): AgentMemory {
    return {
      history: [],
      strategy_bias: {
        dance: 0.25,
        vlog: 0.25,
        skit: 0.25,
        challenge: 0.25
      }
    };
  },

  /**
   * 核心思考迴圈：結合人設、趨勢、記憶來產生決策
   */
  async think(
    profile: CharacterProfile,
    memory: AgentMemory,
    trends: ShortsData[]
  ): Promise<{ topic: string; category: string; reasoning: string; visual_style: string }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // 1. 提取最近 5 部影片的紀錄
    const recentHistory = memory.history.slice(0, 5).map(h => `- ${h.topic} (${h.category})`).join('\n');
    
    // 2. 提取趨勢關鍵字
    const trendKeywords = trends.map(t => t.title).join(', ');

    const prompt = `
      You are an autonomous AI content creator manager for a virtual idol named "${profile.name}".
      
      === YOUR PERSONA ===
      ${profile.description}
      
      === YOUR MEMORY (Last 5 videos) ===
      ${recentHistory || "No videos created yet. This is your debut."}
      
      === CURRENT MARKET TRENDS ===
      ${trendKeywords}
      
      === TASK ===
      Decide on the NEXT video concept.
      
      RULES:
      1. Do NOT repeat the same topic as the last 2 videos.
      2. If trends match your persona, ride the trend. If not, do a "Character Vlog" or "Routine".
      3. **REALISM FOCUS**: You must describe a visual style that looks like RAW FOOTAGE (Phone camera, CCTV, or Handheld). No "perfect AI 3D render" looks.
      
      Output JSON format.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING, description: "Detailed video concept" },
            category: { type: Type.STRING, enum: ["dance", "vlog", "skit", "challenge"] },
            reasoning: { type: Type.STRING, description: "Why did you choose this? (First person perspective)" },
            visual_style: { type: Type.STRING, description: "Specific camera instructions for realism (e.g. 'Shot on iPhone, grainy, handheld')" }
          },
          required: ["topic", "category", "reasoning", "visual_style"]
        }
      }
    });

    const decision = JSON.parse(response.text || '{}');
    return decision;
  },

  /**
   * 模擬反思與學習 (更新偏好權重)
   * 在真實環境中，這會連接 YouTube Analytics API
   */
  async reflect(memory: AgentMemory, lastVideoId: string): Promise<AgentMemory> {
    // 模擬：隨機產生這次影片的成效
    const mockViews = Math.floor(Math.random() * 50000) + 1000;
    const mockRetention = Math.random() * 0.5 + 0.4; // 40% - 90%

    // 找到最後一個 log 並更新數據
    const lastLogIndex = memory.history.findIndex(h => h.videoId === lastVideoId);
    if (lastLogIndex === -1) return memory;

    const lastLog = memory.history[lastLogIndex];
    lastLog.performance_mock = { views: mockViews, retention: mockRetention };

    // 簡單的學習邏輯：如果成效好 (>10000 views)，增加該類別的權重
    const newBias = { ...memory.strategy_bias };
    const category = lastLog.category as keyof typeof newBias;
    
    if (mockViews > 20000) {
      newBias[category] = Math.min(newBias[category] + 0.1, 0.8);
      // 歸一化 (Normalization) 省略，為示範邏輯
    }

    return {
      ...memory,
      history: [...memory.history], // Update log in place
      strategy_bias: newBias
    };
  }
};
