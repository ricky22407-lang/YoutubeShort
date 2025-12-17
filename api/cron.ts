import handler from './pipeline';

/**
 * Cron Handler
 * 
 * In a Vercel/Serverless environment without a persistent database, 
 * we cannot iterate through "all saved channels" because we don't know them.
 * 
 * DESIGN:
 * This endpoint expects a POST request containing the `ChannelConfig` payload.
 * An external scheduler (like Vercel Cron or a custom script) would call this 
 * for each channel passing the stored configuration/tokens.
 * 
 * For this demo app, the "Cron" is simulated by the Client iterating its LocalStorage 
 * and calling this endpoint for each active channel.
 */
export default async function cronHandler(req: any, res: any) {
    if (req.method === 'GET') {
        // Vercel Cron pings GET
        return res.status(200).json({ status: 'Cron Listener Active. Use POST to trigger.' });
    }
    
    // Reuse the pipeline logic
    return handler(req, res);
}