
# YouTube Shorts Automation System v2.0.6 - Project Report

## 📋 Executive Summary
This project is an end-to-end automation suite for YouTube Shorts. It leverages the latest Gemini 3 and Veo 3.1 models to analyze global trends, generate creative video concepts, compose high-fidelity production prompts, and generate vertical (9:16) videos for automated scheduling and publishing.

## 🏗️ Architecture & Workflow
The system follows a strict 7-stage modular pipeline to ensure high-quality content generation:

1. **TrendSearcher (Stage 0)**: Interacts with the YouTube Data API v3 to fetch real-time trending Shorts metadata based on regional keywords.
2. **TrendSignalExtractor (Stage 1)**: Uses `gemini-3-flash-preview` to identify high-performing action verbs, subjects, and viral structures.
3. **CandidateThemeGenerator (Stage 2)**: Brainstorms 3 innovative video concepts derived from the trend signals.
4. **CandidateWeightEngine (Stage 3)**: A scoring engine that evaluates candidates against the specific channel's target audience and niche.
5. **PromptComposer (Stage 4)**: Generates highly detailed visual prompts optimized for the Veo video model.
6. **VideoGenerator (Stage 5)**: Utilizes the `veo-3.1-fast-generate-preview` model to generate high-quality vertical MP4 assets.
7. **UploaderScheduler (Stage 6)**: Manages OAuth2 credentials to securely upload and schedule videos directly to YouTube.

## 🛠️ Tech Stack
- **Frontend**: React (v19), Tailwind CSS, Vite.
- **Backend/API**: Vercel Serverless Functions (Node.js).
- **AI Engine**: `@google/genai` (v1.34.0).
- **Models**: 
  - Reasoning/Text: `gemini-3-flash-preview`
  - Video Generation: `veo-3.1-fast-generate-preview`
- **Data Persistence**: LocalStorage for channel configurations and auth tokens.

## 🔐 Security & Compliance
- **OAuth2**: Uses official Google OAuth2 flows for secure channel management.
- **Billing Protection**: Implements mandatory API Key selection for high-cost video generation tasks to ensure user-controlled billing.
- **Safe Fallbacks**: Includes mock data modes for development and testing without consuming API quota.

## 🚀 Future Roadmap
- Integration with Gemini 3 Pro for more complex narrative scripts.
- Multi-speaker TTS support for narrated Shorts.
- Real-time performance tracking dashboard.
