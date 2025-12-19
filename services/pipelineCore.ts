
import { 
  ShortsData, TrendSignals, CandidateTheme, ChannelState, 
  PromptOutput, VideoAsset, ChannelConfig, UploaderInput, UploadResult 
} from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'buffer';

const textModelId = "gemini-3-flash-preview";
const videoModelId = "veo-3.1-fast-generate-preview";

// --- 輔助函數：Gemini JSON 生成 ---
async function generateJSON<T>(prompt: string, systemInstruction: string, schema: any): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: textModelId,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1,
    },
  });
  return JSON.parse(response.text || '{}') as T;
}

// --- 模組核心邏輯整合 ---

export const PipelineCore = {
  /**
   * 趨勢抓取：封裝動態 googleapis 載入
   */
  async fetchTrends(config: ChannelConfig): Promise<ShortsData[]> {
    try {
      const { google } = await import('googleapis');
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !config.auth) return this.getMockTrends();

      const auth = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials(config.auth);
      const service = google.youtube({ version: 'v3', auth });

      const searchRes = await service.search.list({
        part: ['snippet'],
        q: `#shorts ${config.searchKeywords?.[0] || 'AI'}`,
        type: ['video'],
        regionCode: config.regionCode || 'TW',
        maxResults: 8,
        order: 'viewCount'
      });

      const videoIds = (searchRes.data.items || []).map(i => i.id?.videoId).filter(Boolean) as string[];
      if (videoIds.length === 0) return this.getMockTrends();

      const videosRes = await service.videos.list({ part: ['snippet', 'statistics'], id: videoIds });
      return (videosRes.data.items || []).map(v => ({
        id: v.id || 'unknown',
        title: v.snippet?.title || 'No Title',
        hashtags: v.snippet?.tags || [],
        view_count: parseInt(v.statistics?.viewCount || '0', 10),
        region: config.regionCode,
        view_growth_rate: 1.5,
      }));
    } catch (e) {
      console.warn("Trend API Error, falling back to mock:", e);
      return this.getMockTrends();
    }
  },

  /**
   * 企劃生成：Gemini 推理
   */
  async planContent(trends: ShortsData[], channelState: ChannelState): Promise<PromptOutput> {
    const signalsSchema = {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING },
        subject: { type: Type.STRING },
        vibe: { type: Type.STRING }
      },
      required: ["action", "subject"]
    };

    const signals = await generateJSON<any>(
      `Analyze these trends: ${JSON.stringify(trends)}`,
      "You are a trend analyst. Extract the single most viral action and subject.",
      signalsSchema
    );

    const winnerSchema = {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING },
        title: { type: Type.STRING },
        desc: { type: Type.STRING }
      },
      required: ["prompt", "title", "desc"]
    };

    const assets = await generateJSON<any>(
      `Create a Shorts concept for ${signals.subject} ${signals.action}. Channel niche: ${channelState.niche}`,
      "You are a viral content creator. Create high-fidelity visual prompts for Veo and catchy titles.",
      winnerSchema
    );

    return {
      candidate_id: "auto_" + Date.now(),
      prompt: assets.prompt,
      title_template: assets.title,
      description_template: assets.desc,
      candidate_reference: { subject_type: signals.subject, action_verb: signals.action } as any
    };
  },

  /**
   * 影片渲染：Veo 3.1 引擎
   */
  async renderVideo(metadata: PromptOutput): Promise<VideoAsset> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let operation = await ai.models.generateVideos({
      model: videoModelId,
      prompt: metadata.prompt,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const arrayBuffer = await response.arrayBuffer();

    return {
      candidate_id: metadata.candidate_id,
      video_url: `data:video/mp4;base64,${Buffer.from(arrayBuffer).toString('base64')}`,
      mime_type: "video/mp4",
      status: "generated",
      generated_at: new Date().toISOString()
    };
  },

  /**
   * 自動上傳：YouTube API
   */
  async uploadVideo(input: UploaderInput): Promise<UploadResult> {
    const { google } = await import('googleapis');
    const { Readable } = await import('stream');

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(input.authCredentials!);
    const service = google.youtube({ version: 'v3', auth: oauth2Client });

    const base64Data = input.video_asset.video_url.split(',').pop()!;
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const res = await service.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title: input.metadata.title_template, description: input.metadata.description_template },
        status: { privacyStatus: input.schedule.privacy_status, publishAt: input.schedule.publish_at }
      },
      media: { body: stream, mimeType: 'video/mp4' }
    });

    return {
      platform: 'youtube',
      video_id: res.data.id!,
      platform_url: `https://youtube.com/shorts/${res.data.id}`,
      status: 'uploaded',
      uploaded_at: new Date().toISOString()
    };
  },

  getMockTrends(): ShortsData[] {
    return [{ id: "m1", title: "AI Trend 2025", hashtags: ["#ai"], view_count: 100000, region: "TW", view_growth_rate: 1.5 }];
  }
};
