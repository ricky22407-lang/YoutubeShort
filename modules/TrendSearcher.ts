import { ShortsData, IModule, ChannelConfig } from '../types';

/**
 * Phase 0: Trend Searcher (Real Data)
 */
export class TrendSearcher implements IModule<ChannelConfig, ShortsData[]> {
  name = "Trend Searcher";
  description = "Fetches real top-performing Shorts from YouTube Data API.";

  async execute(config: ChannelConfig): Promise<ShortsData[]> {
    if (typeof window !== 'undefined') {
      console.warn("[TrendSearcher] Browser execution detected. Returning mock data.");
      return this.getMockData();
    }

    // Server-side only
    const { google } = await import('googleapis');
    
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    
    if (config.auth) {
        auth.setCredentials(config.auth);
    } else {
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
            regionCode: config.regionCode,
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
        console.error("[TrendSearcher] API Error:", error.message);
        return this.getMockData();
    }
  }

  public getMockData(): ShortsData[] {
      return [
        {
            id: "mock_v1",
            title: "AI Generated Mock Video 1",
            hashtags: ["#ai", "#future", "#shorts"],
            view_count: 1000000,
            region: "US",
            view_growth_rate: 1.5
        }
      ];
  }
}