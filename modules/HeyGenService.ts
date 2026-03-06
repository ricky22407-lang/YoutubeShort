export class HeyGenService {
    async generateVideo(text: string, avatarId: string, voiceId: string): Promise<string> {
        const apiKey = process.env.HEYGEN_API_KEY;
        
        if (!apiKey) {
            throw new Error("⚠️ 系統遺失 HEYGEN_API_KEY！請至 Vercel 環境變數中設定。");
        }

        console.log(`[HeyGen] 開始生成數位人影片 | Avatar: ${avatarId} | Voice: ${voiceId}`);

        // 1. 發送生成請求給 HeyGen
        const generateRes = await fetch('https://api.heygen.com/v2/video/generate', {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_inputs: [
                    {
                        character: {
                            type: "avatar",
                            avatar_id: avatarId,
                            avatar_style: "normal"
                        },
                        voice: {
                            type: "text",
                            input_text: text,
                            voice_id: voiceId
                        }
                    }
                ],
                // 設定為直式短影音比例
                dimension: {
                    width: 720,
                    height: 1280
                }
            })
        });

        if (!generateRes.ok) {
            const errText = await generateRes.text();
            throw new Error(`HeyGen API 請求失敗: ${errText}`);
        }

        const generateData = await generateRes.json();
        const videoId = generateData.data?.video_id;

        if (!videoId) {
            throw new Error("HeyGen 未回傳 video_id，請檢查 Avatar ID 是否正確。");
        }

        console.log(`[HeyGen] 成功建立任務 (Video ID: ${videoId})，等待 AI 渲染中...`);

        // 2. 每 5 秒輪詢一次，檢查影片是否渲染完畢
        let videoUrl = "";
        let attempts = 0;
        const maxAttempts = 60; // 最長等待 5 分鐘 (60次 * 5秒)

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
                method: 'GET',
                headers: {
                    'X-Api-Key': apiKey
                }
            });

            const statusData = await statusRes.json();
            const status = statusData.data?.status;

            console.log(`[HeyGen] 渲染狀態: ${status}...`);

            if (status === 'completed') {
                videoUrl = statusData.data?.video_url;
                break;
            } else if (status === 'failed' || status === 'error') {
                throw new Error("HeyGen 影片渲染失敗，可能是額度不足或字數超過限制。");
            }

            attempts++;
        }

        if (!videoUrl) {
            throw new Error("HeyGen 影片渲染超時。");
        }

        console.log(`[HeyGen] 🎉 影片生成完畢: ${videoUrl}`);
        return videoUrl;
    }
}