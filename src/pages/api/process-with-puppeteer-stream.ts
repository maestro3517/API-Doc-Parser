import { NextApiRequest, NextApiResponse } from "next";
import { processApiEndpointWithPuppeteer } from "../../utils/api-processing/stages/2-processing-puppeteer";

/**
 * API route handler for processing API documentation using Puppeteer
 * with optional AI-based fallback processing
 * 
 * @param req Request containing:
 *        - url: The URL to process
 *        - aiApiKey: (Optional) API key for AI-based processing fallback
 * @param res Response with the processing results
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, aiApiKey } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    console.log(`Processing ${url} with Puppeteer workflow${aiApiKey ? ' (with AI fallback)' : ''}`);
    const result = await processApiEndpointWithPuppeteer(url, aiApiKey);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error processing URL:", error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : "An error occurred while processing the URL"
    });
  }
}

export const config = {
  api: {
    bodyParser: true
  }
}; 