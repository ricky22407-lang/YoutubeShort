export class HeyGenService {
    private getApiKey(): string {
        const apiKey = process.env.HEYGEN_API_KEY;
        if (!apiKey) throw new Error("⚠️ 系統遺失 HEYGEN_API_KEY！請至 Vercel 環境變數中設定。");
        return apiKey;
    }

    // 步驟 1: 提交任務
    async submitVideoTask(text: string, avatarId: string, voiceId: string): Promise<string> {
        const apiKey = this.getApiKey();
        console.log(`[HeyGen] 提交任務 | Avatar: ${avatarId} | Voice: ${voiceId}`);

        const res = await fetch('https://api.heygen.com/v2/video/generate', {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_inputs: [{
                    character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
                    voice: { type: "text", input_text: text, voice_id: voiceId }
                }],
                dimension: { width: 720, height: 1280 }
            })
        });

        if (!res.ok) throw new Error(`HeyGen API 提交失敗: ${await res.text()}`);
        const data = await res.json();
        if (!data.data?.video_id) throw new Error("HeyGen 未回傳 video_id");
        return data.data.video_id;
    }

    // 步驟 2: 查詢進度
    async checkVideoStatus(videoId: string): Promise<{ status: string, url?: string }> {
        const apiKey = this.getApiKey();
        const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
            method: 'GET',
            headers: { 'X-Api-Key': apiKey }
        });
        const data = await res.json();
        return {
            status: data.data?.status || 'processing',
            url: data.data?.video_url
        };
    }
}