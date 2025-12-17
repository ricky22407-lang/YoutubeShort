import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/';

export default async function handler(req: any, res: any) {
  try {
      if (!CLIENT_ID || !CLIENT_SECRET) {
          console.error("Auth Config Missing");
          return res.status(500).json({ error: "Server Configuration Error: Google Client ID/Secret missing." });
      }

      const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
      );

      if (req.method === 'GET') {
        const { action } = req.query;
        if (action === 'url') {
          const scopes = [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
          ];
          const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
          });
          return res.status(200).json({ url });
        }
      }

      if (req.method === 'POST') {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Missing auth code' });

        try {
          const { tokens } = await oauth2Client.getToken(code);
          return res.status(200).json({ tokens });
        } catch (error: any) {
          return res.status(500).json({ error: 'Token Exchange Failed: ' + error.message });
        }
      }

      return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error: any) {
      console.error("Auth API Crash:", error);
      return res.status(500).json({ error: "Internal Server Error" });
  }
}