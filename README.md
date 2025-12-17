# YouTube Shorts Automation System (Full Stack)

This project is a modular AI system for analyzing YouTube Shorts trends and generating video candidates, scripts, and prompts. It is architected as a full-stack application using React (Frontend) and Serverless Functions (Backend).

## 🚀 Features

1.  **Trend Analysis**: Extracts statistical signals from raw Shorts data.
2.  **Candidate Generation**: Brainstorms viral video concepts.
3.  **Weight Engine**: Scores candidates based on channel fit.
4.  **Prompt Composition**: Generates prompts for AI Video models.
5.  **Video Generation**: Integrates with Google Veo (via Gemini API).
6.  **Auto Upload**: Simulates YouTube API upload and scheduling.

## 🛠️ Tech Stack

*   **Frontend**: React, Tailwind CSS
*   **Backend**: Node.js (Vercel Serverless Functions / Express)
*   **AI**: Google GenAI SDK (Gemini 2.5, Veo)

## 📦 Setup & Deployment

### 1. Environment Variables

Create a `.env` file in the root directory:

```env
# Required for AI features
API_KEY=your_google_genai_api_key

# Required for YouTube Uploads (Real implementation)
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
```

### 2. Local Development

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the development server (creates /api proxies):
    ```bash
    npm run dev
    ```

### 3. Deploy to Vercel

1.  Push code to GitHub.
2.  Import project into Vercel.
3.  Add the `API_KEY` in Vercel Project Settings > Environment Variables.
4.  Deploy.

## 📂 Project Structure

*   `/api`: Backend serverless functions.
*   `/modules`: Core logic classes (executed by Backend).
*   `/services`: External API wrappers (Gemini, YouTube).
*   `/components`: React UI components.
*   `/schemas`: JSON schemas for AI structured output.

## ⚠️ Notes on Google Veo

Video generation using the Veo model is time-intensive and requires a specific allowlisted API Key. The system implements polling to wait for video completion.

---
**Roles:**
*   Gemini (Engineering)
*   Grok (Product Management)
