export class HeyGenService {
    private getApiKey(): string {
        const apiKey = process.env.HEYGEN_API_KEY;
        if (!apiKey) throw new Error("⚠️ 系統遺失 HEYGEN_API_KEY！請至 Vercel 環境變數中設定。");
        return apiKey;
    }
// 🚀 新增：透過 Group ID 獲取底下所有的 Look IDs
    async getAvatarGroupLooks(groupId: string): Promise<string[]> {
        const apiKey = this.getApiKey();
        try {
            const res = await fetch(`https://api.heygen.com/v2/avatar_group/${groupId}/avatars`, {
                method: 'GET',
                headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
            });
            
            if (!res.ok) return []; // 如果這不是 Group ID (可能只是單一 ID)，就會回傳空陣列
            
            const data = await res.json();
            // 萃取出所有的 avatar_id
            if (data?.data?.avatars && Array.isArray(data.data.avatars)) {
                return data.data.avatars.map((a: any) => a.avatar_id).filter(Boolean);
            }
            return [];
        } catch (e) {
            console.error("[HeyGen] 獲取 Avatar Group 失敗:", e);
            return [];
        }
    }

    // 步驟 1: 提交任務 (加入了 scale 縮放參數解決白邊)
    async submitVideoTask(text: string, avatarId: string, voiceId: string, scale: number = 1.0): Promise<string> {
        const apiKey = this.getApiKey();
        console.log(`[HeyGen] 提交任務 | Avatar: ${avatarId} | Voice: ${voiceId} | Scale: ${scale}`);

        const res = await fetch('https://api.heygen.com/v2/video/generate', {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_inputs: [{
                    character: { 
                        type: "avatar", 
                        avatar_id: avatarId, 
                        avatar_style: "normal",
                        scale: scale // 👈 放大畫面填滿直式白邊
                    },
                    voice: { type: "text", input_text: text, voice_id: voiceId },
                    background: { type: "color", value: "#000000" } // 👈 預設改為黑邊，若有邊界也比較自然
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