
import { 
  ShortsData, ChannelState, PromptOutput, VideoAsset, 
  ChannelConfig, UploadResult 
} from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

const TEXT_MODEL = "gemini-3-flash-preview";
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";

/**
 * 輕量化 REST 呼叫
 */
async function youtubeRest(path: string, method: 'GET' | 'POST', body: any, auth: any) {
  const url = `https://www.googleapis.com/youtube/v3/${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`YouTube API: ${response.status} - ${errText}`);
  }
  return response.json();
}

export const PipelineCore = {
  async fetchTrends(config: ChannelConfig): Promise<ShortsData[]> {
    if (!config.auth?.access_token) return this.getMockTrends();
    try {
      const query = encodeURIComponent(`#shorts ${config.searchKeywords?.[0] || 'AI'}`);
      const searchData = await youtubeRest(
        `search?part=snippet&q=${query}&type=video&regionCode=${config.regionCode || 'TW'}&maxResults=8&order=viewCount`, 
        'GET', null, config.auth
      );
      const videoIds = (searchData.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
      if (videoIds.length === 0) return this.getMockTrends();

      const videosData = await youtubeRest(
        `videos?part=snippet,statistics&id=${videoIds.join(',')}`, 
        'GET', null, config.auth
      );

      return (videosData.items || []).map((v: any) => ({
        id: v.id || 'unknown',
        title: v.snippet?.title || 'No Title',
        hashtags: v.snippet?.tags || [],
        view_count: parseInt(v.statistics?.viewCount || '0', 10),
        region: config.regionCode,
        view_growth_rate: 1.5,
      }));
    } catch (e: any) {
      console.error("Fetch Error:", e.message);
      return this.getMockTrends();
    }
  },

  async planContent(trends: ShortsData[], channelState: ChannelState): Promise<PromptOutput> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `分析趨勢: ${JSON.stringify(trends)}。頻道主軸: ${channelState.niche}`,
      config: {
        systemInstruction: "你是一位頂尖短影音企劃。請產出 JSON：{ \"prompt\": \"視覺描述\", \"title\": \"標題\", \"desc\": \"描述\" }。",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING },
            title: { type: Type.STRING },
            desc: { type: Type.STRING }
          },
          required: ["prompt", "title", "desc"]
        }
      }
    });

    const assets = JSON.parse(response.text || '{}');
    return {
      candidate_id: "ai_" + Date.now(),
      prompt: assets.prompt,
      title_template: assets.title,
      description_template: assets.desc,
      candidate_reference: { subject_type: "AUTO" } as any
    };
  },

  async renderVideo(metadata: PromptOutput): Promise<VideoAsset> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let operation = await ai.models.generateVideos({
      model: VIDEO_MODEL,
      prompt: metadata.prompt,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });

    // 1. 首段盲等 120s
    await new Promise(r => setTimeout(r, 120000));

    let attempts = 0;
    while (!operation.done && attempts < 20) {
      // 2. 30s 查詢間隔
      await new Promise(r => setTimeout(r, 30000));
      operation = await ai.operations.getVideosOperation({ operation });
      attempts++;
    }

    if (!operation.done) throw new Error("影片渲染逾時");

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      candidate_id: metadata.candidate_id,
      video_url: `data:video/mp4;base64,${base64}`,
      mime_type: "video/mp4",
      status: "generated",
      generated_at: new Date().toISOString()
    };
  },

  async uploadVideo(input: any): Promise<UploadResult> {
    await new Promise(r => setTimeout(r, 2000));
    return {
      platform: 'youtube',
      video_id: 'mock_' + Date.now(),
      platform_url: `https://youtube.com/shorts/sync_done`,
      status: 'uploaded',
      uploaded_at: new Date().toISOString()
    };
  },

  getMockTrends(): ShortsData[] {
    return [{ id: "m1", title: "AI Life Hacks", hashtags: ["#ai"], view_count: 100, region: "TW", view_growth_rate: 1.1 }];
  }
};
