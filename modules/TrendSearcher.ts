
import { ShortsData, IModule, ChannelConfig } from '../types';

export class TrendSearcher implements IModule<ChannelConfig, { nicheTrends: ShortsData[], globalTrends: ShortsData[] }> {
  name = "Trend Searcher v2";
  description = "雙軌搜尋引擎：垂直領域深度 + 全域流量廣度。";

  async execute(config: ChannelConfig): Promise<{ nicheTrends: ShortsData[], globalTrends: ShortsData[] }> {
    // 如果在瀏覽器端運行，返回模擬數據
    if (typeof window !== 'undefined') {
      return { nicheTrends: this.getMockData('niche'), globalTrends: this.getMockData('global') };
    }

    try {
      const { google } = await import('googleapis');
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !config.auth) {
        console.warn("[TrendSearcher] 無授權資訊，使用模擬數據。");
        return { nicheTrends: this.getMockData('niche'), globalTrends: this.getMockData('global') };
      }

      const auth = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials(config.auth);
      const service = google.youtube({ version: 'v3', auth });

      // 軌道 A：垂直利基搜尋
      const nicheQuery = `#shorts ${config.niche || 'AI'}`;
      const nicheRes = await service.search.list({
        part: ['snippet'],
        q: nicheQuery,
        type: ['video'],
        regionCode: config.regionCode || 'TW',
        maxResults: 5,
        order: 'viewCount'
      });

      // 軌道 B：全域熱門搜尋 (不限主題)
      const globalRes = await service.search.list({
        part: ['snippet'],
        q: '#shorts',
        type: ['video'],
        regionCode: config.regionCode || 'TW',
        maxResults: 5,
        order: 'viewCount'
      });

      const processItems = async (items: any[]) => {
        const ids = items.map(i => i.id?.videoId).filter(Boolean);
        if (ids.length === 0) return [];
        const vRes = await service.videos.list({ part: ['snippet', 'statistics'], id: ids });
        return (vRes.data.items || []).map(v => ({
          id: v.id || 'unknown',
          title: v.snippet?.title || 'No Title',
          hashtags: v.snippet?.tags || [],
          view_count: parseInt(v.statistics?.viewCount || '0', 10),
          region: config.regionCode,
          view_growth_rate: 1.5
        }));
      };

      return {
        nicheTrends: await processItems(nicheRes.data.items || []),
        globalTrends: await processItems(globalRes.data.items || [])
      };

    } catch (e: any) {
      console.error("[TrendSearcher] API Error:", e.message);
      return { nicheTrends: this.getMockData('niche'), globalTrends: this.getMockData('global') };
    }
  }

  private getMockData(type: string): ShortsData[] {
    return [{
      id: "mock_" + type,
      title: type === 'niche' ? "利基市場高流量影片" : "全域爆紅病毒影片",
      hashtags: ["#shorts"],
      view_count: 99999,
      view_growth_rate: 2.0
    }];
  }
}
