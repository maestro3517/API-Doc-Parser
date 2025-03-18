import { NextApiRequest, NextApiResponse } from "next";
import { processRootUrl } from "@/utils/api-processing";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid API key" });
  }
  const apiKey = authHeader.split(" ")[1];

  const { rootUrl, model = 'openai', additionalApiKey } = req.body;
  if (!rootUrl || typeof rootUrl !== "string") {
    return res.status(400).json({ error: "Invalid request body. 'rootUrl' is required." });
  }

  // Validate model parameter
  if (model !== 'gemini' && model !== 'openai') {
    return res.status(400).json({ error: "Invalid model parameter. Must be 'gemini' or 'openai'." });
  }

  try {
    // Process the root URL using our refactored code
    const result = await processRootUrl(
      rootUrl, 
      apiKey, 
      model
    );
    
    // Return the result
    res.status(200).json(result);
  } catch (error) {
    console.error("Error processing root URL:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "An error occurred",
      rootUrl,
      model
    });
  }
} 