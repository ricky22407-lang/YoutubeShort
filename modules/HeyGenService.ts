import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import { Readable } from 'stream';

export class HeyGenService {
    private apiKey: string;
    private baseUrl = 'https://api.heygen.com';

    constructor() {
        this.apiKey = process.env.HEYGEN_API_KEY || '';
    }

    async generateVideo(text: string, avatarId: string, voiceId?: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error("HEYGEN_API_KEY is missing");
        }

        console.log(`[HeyGen] Starting generation for avatar ${avatarId}...`);

        // 1. Create Video Task
        const createRes = await fetch(`${this.baseUrl}/v2/video/generate`, {
            method: 'POST',
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                video_inputs: [
                    {
                        character: {
                            type: 'avatar',
                            avatar_id: avatarId,
                            scale: 1.0,
                            avatar_style: 'normal'
                        },
                        voice: {
                            type: 'text',
                            input_text: text,
                            voice_id: voiceId || '2d5b0e6cf361460aa7fc47e3cee4b35c' // Default voice if none provided
                        },
                        background: {
                            type: 'color',
                            value: '#00FF00' // Green screen for easier keying if needed, or just use it as is
                        }
                    }
                ],
                dimension: {
                    width: 720,
                    height: 1280
                },
                aspect_ratio: "9:16"
            })
        });

        if (!createRes.ok) {
            const err = await createRes.text();
            throw new Error(`HeyGen Create Failed: ${err}`);
        }

        const createData = await createRes.json();
        const videoId = createData.data?.video_id;
        if (!videoId) throw new Error("HeyGen returned no video_id");

        console.log(`[HeyGen] Task Created: ${videoId}. Waiting for completion...`);

        // 2. Poll for Status
        let videoUrl = '';
        let attempts = 0;
        while (attempts < 60) { // Wait up to 5 minutes
            await new Promise(r => setTimeout(r, 5000));
            
            const statusRes = await fetch(`${this.baseUrl}/v1/video_status.get?video_id=${videoId}`, {
                headers: {
                    'X-Api-Key': this.apiKey
                }
            });
            
            const statusData = await statusRes.json();
            const status = statusData.data?.status;
            
            if (status === 'completed') {
                videoUrl = statusData.data?.video_url;
                break;
            } else if (status === 'failed') {
                throw new Error(`HeyGen Generation Failed: ${statusData.data?.error}`);
            }
            
            console.log(`[HeyGen] Status: ${status} (${attempts}/60)`);
            attempts++;
        }

        if (!videoUrl) throw new Error("HeyGen Timeout");

        return videoUrl;
    }

    async downloadVideo(url: string, destPath: string): Promise<void> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download HeyGen video: ${res.statusText}`);
        const fileStream = fs.createWriteStream(destPath);
        await finished(Readable.fromWeb(res.body as any).pipe(fileStream));
    }
}
