import { createClient, Video, ErrorResponse } from 'pexels';

// Note: The 'pexels' package might not be installed. 
// If not, we can use simple fetch. I'll use fetch to avoid dependency issues if the package isn't there.
// Actually, I should check if I can install it. But fetch is safer and lighter.

const PEXELS_BASE_URL = 'https://api.pexels.com/videos';

export async function searchVideos(query: string, apiKey: string, perPage: number = 3): Promise<string[]> {
  try {
    const response = await fetch(`${PEXELS_BASE_URL}/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`, {
      headers: {
        'Authorization': apiKey
      }
    });

    if (!response.ok) {
      console.error(`Pexels API Error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    
    // Extract the best quality video link (preferably HD)
    const videoUrls = data.videos.map((video: any) => {
      const files = video.video_files || [];
      // Sort by quality (width * height) descending
      files.sort((a: any, b: any) => (b.width * b.height) - (a.width * a.height));
      return files[0]?.link;
    }).filter((link: string | undefined) => link !== undefined);

    return videoUrls;
  } catch (error) {
    console.error("Failed to fetch Pexels videos:", error);
    return [];
  }
}
