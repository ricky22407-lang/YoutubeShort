import { GoogleGenAI } from "@google/genai";
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';

// Backend logic to handle requests
// In a Vercel environment, this exports a handler function
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { step, input } = req.body;

  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: API_KEY is missing.' });
  }

  try {
    let result;

    switch (step) {
      case 'trend':
        const extractor = new TrendSignalExtractor();
        result = await extractor.execute(input);
        break;

      case 'candidate':
        const generator = new CandidateThemeGenerator();
        result = await generator.execute(input);
        break;

      case 'weight':
        const weighter = new CandidateWeightEngine();
        result = await weighter.execute(input);
        break;

      case 'prompt':
        const composer = new PromptComposer();
        result = await composer.execute(input);
        break;

      case 'video':
        // Note: Video Generation is heavy. Ensure timeout settings on Vercel are high (e.g. 60s+)
        // or use async queues in a real production environment.
        const videoGen = new VideoGenerator();
        result = await videoGen.execute(input);
        
        // Convert Blob URL (which doesn't work cross-server) to Base64 or keep as is if the module handles it.
        // The current VideoGenerator returns a Blob URL which is client-side specific. 
        // We need to adjust the Logic or assume the module has been updated to return a Data URI.
        // *Correction*: The service `generateVideo` fetches bytes. 
        // In a Node environment, `URL.createObjectURL` might not be available or valid for the client.
        // We will assume the service returns a Data URI (base64) for this full-stack impl.
        break;

      case 'upload':
        const uploader = new UploaderScheduler();
        // Here we would inject the server-side OAuth credentials
        console.log("Server: Injecting OAuth Credentials for Upload...");
        result = await uploader.execute(input);
        break;

      default:
        return res.status(400).json({ error: 'Invalid step specified' });
    }

    return res.status(200).json(result);

  } catch (error: any) {
    console.error(`API Error in step ${step}:`, error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}