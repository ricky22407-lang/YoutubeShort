
import { ShortsData, IModule, ChannelConfig } from '../types';

export class TrendSearcher implements IModule<ChannelConfig, { nicheTrends: ShortsData[], globalTrends: ShortsData[] }> {
  name = "Trend Searcher v2.1 (Lightweight)";
  description = "輕量化雙軌搜尋引擎：使用原生 Fetch 確保 Serverless 穩定性。";

  async execute(config: ChannelConfig): Promise<{ nicheTrends: ShortsData[], globalTrends: ShortsData[] }> {
    // 瀏覽器端直接回傳模擬數據
    if (typeof window !== 'undefined') {
      return { nicheTrends: this.getMockData('niche'), globalTrends: this.getMockData('global') };
    }

    const API_KEY = process.env.API_KEY; // 如果有專用的 YouTube Key 也可以分開
    if (!API_KEY) {
      console.warn("[TrendSearcher] Missing API_KEY, using mocks.");
      return { nicheTrends: this.getMockData('niche'), globalTrends: this.getMockData('global') };
    }

    try {
      const fetchYT = async (q: string) => {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=short&maxResults=5&order=viewCount&key=${API_KEY}&regionCode=${config.regionCode || 'TW'}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error.message);
        
        const videoIds = (data.items || []).map((i: any) => i.id.videoId).join(',');
        if (!videoIds) return [];

        const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${API_KEY}`;
        const statsRes = await fetch(statsUrl);
        const statsData = await statsRes.json();

        return (statsData.items || []).map((v: any) => ({
          id: v.id,
          title: v.snippet.title,
          hashtags: v.snippet.tags || [],
          view_count: parseInt(v.statistics.viewCount || '0', 10),
          region: config.regionCode,
          view_growth_rate: 1.5
        }));
      };

      const [nicheTrends, globalTrends] = await Promise.all([
        fetchYT(`#shorts ${config.niche}`),
        fetchYT(`#shorts trending`)
      ]);

      return { nicheTrends, globalTrends };
    } catch (e: any) {
      console.error("[TrendSearcher Error]:", e.message);
      return { nicheTrends: this.getMockData('niche'), globalTrends: this.getMockData('global') };
    }
  }

  private getMockData(type: string): ShortsData[] {
    return [{
      id: "mock_" + type + "_" + Date.now(),
      title: type === 'niche' ? "利基市場高流量影片 (模擬)" : "全域爆紅病毒影片 (模擬)",
      hashtags: ["#shorts"],
      view_count: 99999,
      view_growth_rate: 2.0
    }];
  }
}
