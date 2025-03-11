import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import * as cheerio from "cheerio";
import {
  getPrompt,
  sendToGemini,
  sendToOpenAI,
  parseAiResponse,
  ProcessedApiData,
  linkActionPrerequisites,
} from "@/util/ai";

// Function to scrape data from a URL
async function scrapeData(url: string) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    return {
      text: $("body").text(),
      html: response.data,
      $,
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    throw error;
  }
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

// Function to extract API endpoint URLs from a page
function extractApiEndpointUrls(baseUrl: string, $: ReturnType<typeof cheerio.load>): string[] {
  const apiEndpointUrls: Set<string> = new Set();
  const urlObj = new URL(baseUrl);
  const domain = `${urlObj.protocol}//${urlObj.host}`;

  // Look for links that might be API documentation
  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    // Skip external links, anchors, and javascript links
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      return;
    }

    // Convert relative URLs to absolute
    const fullUrl = href.startsWith("http") ? href : new URL(href, domain).toString();
    
    // Check if the URL or link text contains API-related keywords
    const linkText = $(element).text().toLowerCase();
    const isApiRelated = [
      "api", "endpoint", "reference", "documentation", "doc", "method", 
      "resource", "rest", "service", "integration"
    ].some(keyword => 
      linkText.includes(keyword) || fullUrl.toLowerCase().includes(keyword)
    );

    if (isApiRelated) {
      apiEndpointUrls.add(fullUrl);
    }
  });

  return Array.from(apiEndpointUrls);
}

// Process a single API endpoint URL
async function processApiEndpoint(url: string, apiKey: string, model: string = 'gemini') {
  try {
    const { text } = await scrapeData(url);
    
    // Check if the URL contains API documentation
    if (!isApiDocumentation(text)) {
      return {
        url,
        status: "skipped",
        reason: "Not API documentation",
      };
    }
    
    // Choose the appropriate AI model
    let result;
    if (model === 'openai') {
      result = await sendToOpenAI(text, apiKey);
    } else {
      result = await sendToGemini(text, apiKey);
    }
    
    const parsedData = parseAiResponse(result) as ProcessedApiData;

    return {
      url,
      status: "success",
      result: parsedData,
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

  const { rootUrl, model = 'openai' } = req.body;
  if (!rootUrl || typeof rootUrl !== "string") {
    return res.status(400).json({ error: "Invalid request body. 'rootUrl' is required." });
  }

  // Validate model parameter
  if (model !== 'gemini' && model !== 'openai') {
    return res.status(400).json({ error: "Invalid model parameter. Must be 'gemini' or 'openai'." });
  }

  try {
    // Step 1: Scrape the root URL
    const { text, $ } = await scrapeData(rootUrl);
    
    // Step 2: Extract potential API endpoint URLs
    const apiEndpointUrls = extractApiEndpointUrls(rootUrl, $);
    
    if (apiEndpointUrls.length === 0) {
      // If no API endpoints found, try processing the root URL itself
      if (isApiDocumentation(text)) {
        // Choose the appropriate AI model
        let result;
        if (model === 'openai') {
          result = await sendToOpenAI(text, apiKey);
        } else {
          result = await sendToGemini(text, apiKey);
        }
        
        const parsedData = parseAiResponse(result) as ProcessedApiData;
        
        return res.status(200).json({
          rootUrl,
          apiEndpoints: [],
          model,
          rootUrlProcessed: {
            url: rootUrl,
            status: "success",
            result: parsedData,
          }
        });
      } else {
        return res.status(404).json({
          error: "No API documentation found on the provided URL or its linked pages",
          rootUrl,
          model
        });
      }
    }
    
    // Step 3: Process each API endpoint URL (with concurrency limit)
    const concurrencyLimit = 5; // Process 5 URLs at a time
    const results = [];
    
    // Process URLs in batches to avoid overwhelming the server
    for (let i = 0; i < apiEndpointUrls.length; i += concurrencyLimit) {
      const batch = apiEndpointUrls.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(url => processApiEndpoint(url, apiKey, model))
      );
      results.push(...batchResults);
    }
    
    // Filter out successful results
    const successfulResults = results.filter(result => result.status === "success");
    
    if (successfulResults.length === 0) {
      return res.status(404).json({
        error: "No valid API documentation found in any of the linked pages",
        rootUrl,
        model,
        scannedUrls: apiEndpointUrls
      });
    }
    
    // Step 4: Link prerequisites between actions
    const successfulActions = successfulResults
      .map(result => result.result)
      .filter((action): action is ProcessedApiData => action !== undefined);
    
    const linkedActions = await linkActionPrerequisites(successfulActions);
    
    // Update the results with the linked actions
    const linkedResults = results.map(result => {
      if (result.status === "success" && result.result) {
        const linkedAction: ProcessedApiData | undefined = linkedActions.find(action => action.id === result.result.id);
        if (linkedAction) {
          return {
            ...result,
            result: linkedAction
          };
        }
      }
      return result;
    });
    
    // Return the processed data with linked prerequisites
    res.status(200).json({
      rootUrl,
      apiEndpoints: apiEndpointUrls,
      model,
      results: linkedResults,
      successCount: successfulResults.length,
      totalScanned: apiEndpointUrls.length
    });
    
  } catch (error) {
    console.error("Error processing root URL:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "An error occurred",
      rootUrl,
      model
    });
  }
} 