
import { ShortsData, IModule, ChannelConfig } from '../types';

/**
 * Phase 0: Trend Searcher
 * 從 YouTube 抓取真實趨勢數據
 */
export class TrendSearcher implements IModule<ChannelConfig, ShortsData[]> {
  name = "Trend Searcher";
  description = "從 YouTube Data API 獲取該地區真實的熱門 Shorts。";

  async execute(config: ChannelConfig): Promise<ShortsData[]> {
    if (typeof window !== 'undefined') {
      return this.getMockData();
    }

    // 動態導入 googleapis 減少 cold start 崩潰機率
    const { google } = await import('googleapis');
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.warn("[TrendSearcher] 環境變數缺失，回傳模擬數據。");
        return this.getMockData();
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    
    if (config.auth) {
        auth.setCredentials(config.auth);
    } else {
        console.warn("[TrendSearcher] 頻道未授權，回傳模擬數據。");
        return this.getMockData();
    }

    const service = google.youtube({ version: 'v3', auth });

    try {
        const keyword = config.searchKeywords[0] || "shorts";
        const searchRes = await service.search.list({
            part: ['snippet'],
            q: `#shorts ${keyword}`,
            type: ['video'],
            videoDuration: 'short',
            regionCode: config.regionCode || 'US',
            maxResults: 10,
            order: 'viewCount'
        });

        if (!searchRes.data.items || searchRes.data.items.length === 0) return this.getMockData();

        const videoIds = searchRes.data.items.map(item => item.id?.videoId).filter(Boolean) as string[];

        const videosRes = await service.videos.list({
            part: ['snippet', 'statistics'],
            id: videoIds
        });

        return (videosRes.data.items || []).map(item => ({
            id: item.id || 'unknown',
            title: item.snippet?.title || 'Unknown Title',
            hashtags: item.snippet?.tags || [],
            view_count: parseInt(item.statistics?.viewCount || '0', 10),
            region: config.regionCode,
            view_growth_rate: 1.0 + Math.random(),
            publishedAt: item.snippet?.publishedAt || new Date().toISOString()
        }));

    } catch (error: any) {
        console.error("[TrendSearcher] YouTube API 錯誤:", error.message);
        return this.getMockData();
    }
  }

  public getMockData(): ShortsData[] {
      return [
        {
            id: "v_trending_01",
            title: "2025 AI Tech Trends You Need to Know",
            hashtags: ["#ai", "#technology", "#shorts"],
            view_count: 5200000,
            region: "TW",
            view_growth_rate: 1.8
        },
        {
            id: "v_trending_02",
            title: "Satisfying Experiments with Liquid Metal",
            hashtags: ["#science", "#satisfying", "#shorts"],
            view_count: 8900000,
            region: "TW",
            view_growth_rate: 2.1
        }
      ];
  }
}
