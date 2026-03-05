export class HeyGenService {
    async generateVideo(text: string, avatarId: string, voiceId: string): Promise<string> {
        console.log(`Generating HeyGen video for: "${text}"`);
        return "https://example.com/placeholder_video.mp4";
    }
}
