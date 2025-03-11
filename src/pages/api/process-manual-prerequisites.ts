import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import * as cheerio from "cheerio";
import {
  sendToGemini,
  sendToOpenAI,
  parseAiResponse,
  ProcessedApiData,
  linkActionPrerequisites,
} from "@/util/ai";

async function scrapeData(url: string) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  return $("body").text();
}

// Function to check if the scraped content contains API documentation
function isApiDocumentation(scrapedData: string): boolean {
  // Check for common API documentation indicators
  const apiKeywords = [
    'api', 'endpoint', 'request', 'response', 'parameter', 
    'method', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
    'header', 'status code', 'authentication', 'token',
    'json', 'xml', 'payload', 'schema'
  ];
  
  // Convert to lowercase for case-insensitive matching
  const lowerCaseData = scrapedData.toLowerCase();
  
  // Count how many API-related keywords are found
  const keywordMatches = apiKeywords.filter(keyword => 
    lowerCaseData.includes(keyword.toLowerCase())
  ).length;
  
  // If we find at least 4 API-related keywords, consider it API documentation
  return keywordMatches >= 4;
}

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

  const { mainUrl, prerequisiteUrls, model = 'gemini' } = req.body;
  
  if (!mainUrl || !prerequisiteUrls || !Array.isArray(prerequisiteUrls)) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  
  // Validate model parameter
  if (model !== 'gemini' && model !== 'openai') {
    return res.status(400).json({ error: "Invalid model parameter. Must be 'gemini' or 'openai'." });
  }

  try {
    // Process each manually added prerequisite URL
    const prerequisiteWorkflows = await Promise.all(
      prerequisiteUrls.map(async (prereqUrl: string) => {
        try {
          // Process each prerequisite URL
          const prereqData = await scrapeData(prereqUrl);
          
          // Check if the URL contains API documentation
          if (!isApiDocumentation(prereqData)) {
            return {
              url: prereqUrl,
              status: "error",
              error: "No relevant API documentation found on this URL",
            };
          }
          
          // Choose the appropriate AI model
          let prereqResult;
          if (model === 'openai') {
            prereqResult = await sendToOpenAI(prereqData, apiKey);
          } else {
            prereqResult = await sendToGemini(prereqData, apiKey);
          }
          
          const prereqParsedData = parseAiResponse(prereqResult) as ProcessedApiData;
          
          return {
            url: prereqUrl,
            status: "success",
            result: prereqParsedData
          };
        } catch (error) {
          return {
            url: prereqUrl,
            status: "error",
            error: error instanceof Error ? error.message : "An error occurred",
          };
        }
      })
    );
    
    // Extract successful actions to link prerequisites
    const allActions: ProcessedApiData[] = [];
    
    // Add all successful prerequisite actions
    prerequisiteWorkflows.forEach(prereq => {
      if (prereq.status === "success" && prereq.result) {
        allActions.push(prereq.result);
      }
    });
    
    // Link prerequisites between all actions if we have multiple actions
    if (allActions.length > 1) {
      // Use AI-powered prerequisite linking with the provided API key
      const linkedActions = await linkActionPrerequisites(allActions, apiKey);
      
      // Update the results with the linked actions
      const linkedPrereqWorkflows = prerequisiteWorkflows.map(prereq => {
        if (prereq.status === "success" && prereq.result) {
          const linkedPrereqAction = linkedActions.find(action => 
            action.id === prereq.result.id
          );
          
          if (linkedPrereqAction) {
            return {
              ...prereq,
              result: linkedPrereqAction
            };
          }
        }
        return prereq;
      });
      
      res.status(200).json({ 
        mainUrl,
        prerequisiteWorkflows: linkedPrereqWorkflows,
        model
      });
    } else {
      res.status(200).json({ 
        mainUrl,
        prerequisiteWorkflows,
        model
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "An error occurred",
      model
    });
  }
}