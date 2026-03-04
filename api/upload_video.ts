
import { Buffer } from 'buffer';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // 影片較大
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { videoUrl, auth, metadata, platform = 'youtube' } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'Missing Data' });

  try {
    // 1. 處理影片資料
    const base64Data = videoUrl.split(',')[1];
    const videoBuffer = Buffer.from(base64Data, 'base64');

    if (platform === 'youtube') {
        if (!auth || !auth.access_token) throw new Error("Missing YouTube Auth Token");
        const accessToken = auth.access_token;
        
        const boundary = '-------STUDIO_UPLOAD_BOUNDARY';
        const jsonMetadata = JSON.stringify({
          snippet: { 
            title: metadata.title || 'AI Generated Shorts', 
            description: metadata.desc || '#Shorts', 
            categoryId: "22" 
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
        });
        
        const multipartBody = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonMetadata}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
          videoBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);

        const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody
        });

        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error.message);

        return res.status(200).json({ 
          success: true, 
          videoId: uploadData.id,
          url: `https://youtube.com/shorts/${uploadData.id}` 
        });
    } 
    else if (platform === 'facebook' || platform === 'instagram') {
        // Mock Implementation for FB/IG as we don't have real tokens/Page IDs in this context
        // In a real app, we would use the Graph API:
        // POST /me/videos (FB) or /media (IG)
        
        // Simulate upload delay
        await new Promise(r => setTimeout(r, 1500));
        
        if (!process.env.FB_APP_ID) {
            throw new Error(`FB_APP_ID not configured. Cannot upload to ${platform}.`);
        }

        return res.status(200).json({
            success: true,
            videoId: `mock_${platform}_${Date.now()}`,
            url: `https://${platform}.com/video/mock_id`,
            note: "Simulation: Upload successful (Graph API requires valid Page Access Token)"
        });
    }

    return res.status(400).json({ error: 'Unsupported Platform' });

  } catch (e: any) {
    console.error("Studio Upload Error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
