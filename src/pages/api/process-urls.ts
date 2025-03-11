import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import {
  getPrompt,
  sendToGemini,
  sendToOpenAI,
  parseAiResponse,
  ProcessedApiData,
  linkActionPrerequisites,
  PrerequisiteReference,
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

// Function to find URLs related to prerequisites in the scraped content
async function findPrerequisiteUrls(
  url: string,
  scrapedData: string,
  prerequisites: Record<string, string | PrerequisiteReference>
): Promise<string[]> {
  try {
    const relatedUrls: string[] = [];

    // If no prerequisites, return empty array
    if (!prerequisites || Object.keys(prerequisites).length === 0) {
      return relatedUrls;
    }

    // Get the base URL for resolving relative links
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Parse the HTML to find links
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // For each prerequisite, look for links that contain keywords from the prerequisite text
    Object.entries(prerequisites).forEach(([key, value]) => {
      // Extract the prerequisite text (either the string value or the description field)
      const prereqText = typeof value === 'string' ? value : value.description;
      
      // Extract keywords from prerequisite description
      const keywords = prereqText
        .toLowerCase()
        .split(/\s+/)
        .filter(
          (word: string) =>
            word.length > 4 &&
            ![
              "must",
              "have",
              "need",
              "required",
              "should",
              "with",
              "your",
            ].includes(word)
        );

      // Find links containing these keywords
      $("a").each((_, element) => {
        const linkText = $(element).text().toLowerCase();
        const href = $(element).attr("href");

        if (href && !relatedUrls.includes(href)) {
          // Check if link text contains any keywords
          const containsKeyword = keywords.some((keyword: string) =>
            linkText.includes(keyword)
          );

          if (containsKeyword) {
            // Resolve relative URLs to absolute URLs
            const fullUrl = href.startsWith("http")
              ? href
              : new URL(href, baseUrl).toString();
            relatedUrls.push(fullUrl);
          }
        }
      });
    });

    return relatedUrls;
  } catch (error) {
    console.error("Error finding prerequisite URLs:", error);
    return [];
  }
}

// Process a single URL and return workflow data
async function processUrl(url: string, apiKey: string, model: string = 'gemini') {
  try {
    const scrapedData = await scrapeData(url);
    
    // Check if the URL contains API documentation
    if (!isApiDocumentation(scrapedData)) {
      return {
        url,
        status: "error",
        error: "No relevant API documentation found on this URL",
      };
    }
    
    // Choose the appropriate AI model
    let result;
    if (model === 'openai') {
      result = await sendToOpenAI(scrapedData, apiKey);
    } else {
      result = await sendToGemini(scrapedData, apiKey);
    }

    // Parse the AI response to extract structured data
    const parsedData = parseAiResponse(result) as ProcessedApiData;

    return {
      url,
      status: "success",
      result: parsedData,
      prerequisiteUrls: [],
    };
  } catch (error) {
    return {
      url,
      status: "error",
      error: error instanceof Error ? error.message : "An error occurred",
    };
  }
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

  const { urls, model = 'gemini' } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  
  // Validate model parameter
  if (model !== 'gemini' && model !== 'openai') {
    return res.status(400).json({ error: "Invalid model parameter. Must be 'gemini' or 'openai'." });
  }

  try {
    // Process all URLs first
    const results = await Promise.all(
      urls.map(async (url: string) => {
        try {
          // Process original URL
          const scrapedData = await scrapeData(url);
          
          // Check if the URL contains API documentation
          if (!isApiDocumentation(scrapedData)) {
            return {
              url,
              status: "error",
              error: "No relevant API documentation found on this URL",
            };
          }
          
          // Choose the appropriate AI model
          let result;
          if (model === 'openai') {
            result = await sendToOpenAI(scrapedData, apiKey);
          } else {
            result = await sendToGemini(scrapedData, apiKey);
          }

          // Parse the AI response to extract structured data
          const parsedData = parseAiResponse(result) as ProcessedApiData;

          // Find URLs related to prerequisites
          const prerequisiteUrls = await findPrerequisiteUrls(
            url,
            scrapedData,
            parsedData.prerequisites
          );

          // Process prerequisite URLs
          const prerequisiteWorkflows = await Promise.all(
            prerequisiteUrls.map(async (prereqUrl) => {
              try {
                // Process each prerequisite URL
                const prereqData = await scrapeData(prereqUrl);
                
                // Check if the prerequisite URL contains API documentation
                if (!isApiDocumentation(prereqData)) {
                  return {
                    url: prereqUrl,
                    status: "error",
                    error: "No relevant API documentation found on this URL",
                  };
                }
                
                // Choose the appropriate AI model for prerequisite
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

          return {
            url,
            status: "success",
            result: parsedData,
            prerequisiteUrls,
            prerequisiteWorkflows
          };
        } catch (error) {
          return {
            url,
            status: "error",
            error: error instanceof Error ? error.message : "An error occurred",
          };
        }
      })
    );

    // Extract all successful actions (main URLs and prerequisites)
    const allActions: ProcessedApiData[] = [];
    
    // Add main actions
    results.forEach(result => {
      if (result.status === "success" && result.result) {
        allActions.push(result.result);
      }
    });
    
    // Add prerequisite actions
    results.forEach(result => {
      if (result.status === "success" && result.prerequisiteWorkflows) {
        result.prerequisiteWorkflows.forEach(prereq => {
          if (prereq.status === "success" && prereq.result) {
            allActions.push(prereq.result);
          }
        });
      }
    });
    
    // Link prerequisites between all actions
    if (allActions.length > 0) {
      // Pass the API key to enable AI-based prerequisite matching
      const linkedActions = await linkActionPrerequisites(allActions, apiKey);
      
      // Update the results with the linked actions
      const linkedResults = results.map(result => {
        if (result.status === "success" && result.result) {
          const linkedMainAction = linkedActions.find(action => action.id === result.result.id);
          
          if (linkedMainAction) {
            // Also update prerequisite workflows if they exist
            let linkedPrereqWorkflows = result.prerequisiteWorkflows;
            
            if (result.prerequisiteWorkflows) {
              linkedPrereqWorkflows = result.prerequisiteWorkflows.map(prereq => {
                if (prereq.status === "success" && prereq.result) {
                  const linkedPrereqAction = linkedActions.find(action => action.id === prereq.result.id);
                  
                  if (linkedPrereqAction) {
                    return {
                      ...prereq,
                      result: linkedPrereqAction
                    };
                  }
                }
                return prereq;
              });
            }
            
            return {
              ...result,
              result: linkedMainAction,
              prerequisiteWorkflows: linkedPrereqWorkflows
            };
          }
        }
        return result;
      });
      
      res.status(200).json({ results: linkedResults, model });
    } else {
      res.status(200).json({ results, model });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "An error occurred",
      model
    });
  }
}
