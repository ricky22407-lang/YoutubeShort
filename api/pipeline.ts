import { GoogleGenAI } from "@google/genai";
import { TrendSignalExtractor } from '../modules/TrendSignalExtractor';
import { CandidateThemeGenerator } from '../modules/CandidateThemeGenerator';
import { CandidateWeightEngine } from '../modules/CandidateWeightEngine';
import { PromptComposer } from '../modules/PromptComposer';
import { VideoGenerator } from '../modules/VideoGenerator';
import { UploaderScheduler } from '../modules/UploaderScheduler';

// Backend logic to handle requests
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
        const videoGen = new VideoGenerator();
        result = await videoGen.execute(input);
        break;

      case 'upload':
        const uploader = new UploaderScheduler();
        // input should now contain { video_asset, metadata, schedule, authCredentials }
        if (input.authCredentials) {
            console.log("Server: Using User-Provided OAuth Credentials for Upload.");
        } else {
            console.log("Server: No OAuth Credentials provided, defaulting to simulation.");
        }
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