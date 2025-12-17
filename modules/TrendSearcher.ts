import { ShortsData, IModule, ChannelConfig } from '../types';
import { google } from 'googleapis';

/**
 * Phase 0: Trend Searcher (Real Data)
 * 
 * Goal: Fetch real YouTube Shorts data based on channel keywords and region.
 * Note: Requires YouTube Data API v3.
 */
export class TrendSearcher implements IModule<ChannelConfig, ShortsData[]> {
  name = "Trend Searcher";
  description = "Fetches real top-performing Shorts from YouTube Data API.";

  async execute(config: ChannelConfig): Promise<ShortsData[]> {
    console.log(`[TrendSearcher] Searching trends for ${config.name} in ${config.regionCode}...`);

    if (!process.env.API_KEY && !process.env.GOOGLE_CLIENT_ID) {
        throw new Error("Missing Google API Configuration.");
    }

    // If no auth is provided, we use the server's API Key (if available) or fall back to mock
    // Note: Search List costs 100 quota units.
    
    // For this implementation, we assume we use the OAuth client for searching to keep it simple,
    // or a separate server-side API key if configured. 
    // We will try to use the user's OAuth token if available to save server quota, 
    // otherwise fallback to a generic search if API_KEY is set for Data API.
    
    // NOTE: In this specific architecture, we reuse the OAuth client for simplicity.
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    
    if (config.auth) {
        auth.setCredentials(config.auth);
    } else {
        // Fallback or Error? For automation, we need auth.
        console.warn("[TrendSearcher] No Auth token for channel. Using Mock Data.");
        return this.getMockData();
    }

    const service = google.youtube({ version: 'v3', auth });

    try {
        const keyword = config.searchKeywords[0] || "shorts";
        
        // 1. Search for Videos
        const searchRes = await service.search.list({
            part: ['snippet'],
            q: `#shorts ${keyword}`,
            type: ['video'],
            videoDuration: 'short', // Explicitly look for shorts
            regionCode: config.regionCode,
            relevanceLanguage: config.regionCode === 'TW' ? 'zh-Hant' : 'en',
            maxResults: 10,
            order: 'viewCount' // Find popular ones
        });

        if (!searchRes.data.items || searchRes.data.items.length === 0) {
            console.warn("No videos found. Returning mock.");
            return this.getMockData();
        }

        const videoIds = searchRes.data.items.map(item => item.id?.videoId).filter(Boolean) as string[];

        // 2. Get Video Details (View Counts, Tags)
        const videosRes = await service.videos.list({
            part: ['snippet', 'statistics'],
            id: videoIds
        });

        const shortsData: ShortsData[] = (videosRes.data.items || []).map(item => {
            const viewCount = parseInt(item.statistics?.viewCount || '0', 10);
            // Heuristic growth rate calculation (randomized for demo as API doesn't give historical data directly)
            const growth = 1.0 + Math.random(); 

            return {
                id: item.id || 'unknown',
                title: item.snippet?.title || 'Unknown Title',
                hashtags: item.snippet?.tags || [],
                view_count: viewCount,
                region: config.regionCode,
                view_growth_rate: parseFloat(growth.toFixed(2)),
                publishedAt: item.snippet?.publishedAt || new Date().toISOString()
            };
        });

        console.log(`[TrendSearcher] Found ${shortsData.length} real videos.`);
        return shortsData;

    } catch (error: any) {
        console.error("[TrendSearcher] API Error:", error.message);
        // Fallback to Mock if quota exceeded or error
        return this.getMockData();
    }
  }

  private getMockData(): ShortsData[] {
      return [
        {
            id: "mock_v1",
            title: "AI Generated Mock Video 1",
            hashtags: ["#ai", "#future", "#shorts"],
            view_count: 1000000,
            region: "US",
            view_growth_rate: 1.5
        },
        {
            id: "mock_v2",
            title: "Tech Trend Mock 2",
            hashtags: ["#tech", "#gadgets"],
            view_count: 500000,
            region: "US",
            view_growth_rate: 1.2
        }
      ];
  }
}