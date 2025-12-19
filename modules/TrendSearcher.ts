
import { ShortsData, IModule, ChannelConfig } from '../types';

export class TrendSearcher implements IModule<ChannelConfig, ShortsData[]> {
  name = "Trend Searcher";
  description = "利用 YouTube Data API 獲取真實熱門資料。";

  async execute(config: ChannelConfig): Promise<ShortsData[]> {
    if (typeof window !== 'undefined') return this.getMockData();

    try {
        const { google } = await import('googleapis');
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !config.auth) {
            console.warn("[TrendSearcher] 未配置 OAuth 或無授權資訊，使用模擬趨勢。");
            return this.getMockData();
        }

        const auth = new google.auth.OAuth2(clientId, clientSecret);
        auth.setCredentials(config.auth);
        const service = google.youtube({ version: 'v3', auth });

        try {
          const searchRes = await service.search.list({
              part: ['snippet'],
              q: `#shorts ${config.searchKeywords?.[0] || 'AI'}`,
              type: ['video'],
              regionCode: config.regionCode || 'TW',
              maxResults: 8,
              order: 'viewCount'
          });

          const items = searchRes.data.items || [];
          if (items.length === 0) return this.getMockData();

          const videoIds = items.map(i => i.id?.videoId).filter(Boolean) as string[];
          const videosRes = await service.videos.list({
              part: ['snippet', 'statistics'],
              id: videoIds
          });

          return (videosRes.data.items || []).map(v => ({
              id: v.id || 'unknown',
              title: v.snippet?.title || 'No Title',
              hashtags: v.snippet?.tags || [],
              view_count: parseInt(v.statistics?.viewCount || '0', 10),
              region: config.regionCode,
              view_growth_rate: 1.5,
              publishedAt: v.snippet?.publishedAt || ''
          }));
        } catch (apiError: any) {
          // 關鍵偵測：如果 API 未啟用，Google 會回傳 403 錯誤
          if (apiError.errors && apiError.errors[0]?.reason === 'accessNotConfigured') {
            const message = apiError.errors[0]?.message || "";
            throw new Error(`CRITICAL_API_DISABLED: 您的 Google Cloud 專案尚未啟用 YouTube Data API v3。請前往 https://console.cloud.google.com/apis/library/youtube.googleapis.com 點擊「啟用」。`);
          }
          throw apiError;
        }

    } catch (e: any) {
        // 如果是我們自定義的關鍵錯誤，直接往外拋讓 Pipeline 捕捉
        if (e.message.includes("CRITICAL_API_DISABLED")) {
          throw e;
        }
        console.error("[TrendSearcher] 捕捉到一般錯誤 (回退至模擬數據):", e.message);
        return this.getMockData();
    }
  }

  getMockData(): ShortsData[] {
    return [
      { id: "m1", title: "2025 AI 最新趨勢分析", hashtags: ["#ai", "#shorts"], view_count: 500000, region: "TW", view_growth_rate: 1.2 },
      { id: "m2", title: "液態金屬科學實驗", hashtags: ["#science", "#shorts"], view_count: 1200000, region: "TW", view_growth_rate: 1.8 }
    ];
  }
}
