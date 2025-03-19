import { v4 as uuidv4 } from "uuid";
import { extractApiStructure, scrapeDataWithPuppeteer, isApiDocumentation } from "./1-scraping-puppeteer";
import { ProcessedApiData, ApiResult, ApiSuccessResult, ApiErrorResult, ApiSkippedResult } from "./2-processing";

/**
 * Converts the Puppeteer-extracted API data to the standard ProcessedApiData format
 * @param apiData The structured API data extracted by Puppeteer
 * @returns Standardized ProcessedApiData objects
 */
export function convertPuppeteerDataToStandardFormat(apiData: any): ProcessedApiData[] {
  const result: ProcessedApiData[] = [];
  
  if (!apiData || !apiData.apiEndpoints || !Array.isArray(apiData.apiEndpoints)) {
    return result;
  }
  
  for (const endpoint of apiData.apiEndpoints) {
    if (!endpoint.name || (!endpoint.method && !endpoint.endpoint)) {
      continue; // Skip invalid endpoints
    }
    
    // Generate action name in snake_case
    const actionName = endpoint.name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    
    // Convert parameters to inputs
    const inputs: Record<string, any> = {};
    for (const [key, value] of Object.entries(endpoint.parameters || {})) {
      inputs[key] = {
        type: "string", // Default type
        description: value
      };
    }
    
    // Create the standardized ProcessedApiData object
    const processedData: ProcessedApiData = {
      id: `action_${uuidv4()}`,
      step_name: endpoint.name,
      action: actionName,
      inputs,
      prerequisites: {},
      api_config: {
        url: endpoint.endpoint || apiData.url,
        method: endpoint.method || "GET",
        passInputsAsQuery: endpoint.method === "GET",
        headers: {
          "Content-Type": "application/json"
        }
      },
      response_schema: {
        type: "object",
        properties: {}
      }
    };
    
    result.push(processedData);
  }
  
  return result;
}

/**
 * Processes a single API endpoint URL using Puppeteer
 * @param url The URL to process
 * @returns The API result
 */
export async function processApiEndpointWithPuppeteer(url: string): Promise<ApiResult> {
  try {
    // First try to extract structured API information
    const apiData = await extractApiStructure(url);
    
    // If we found structured API endpoints, convert them to our standard format
    if (apiData && apiData.apiEndpoints && apiData.apiEndpoints.length > 0) {
      const processedData = convertPuppeteerDataToStandardFormat(apiData);
      
      if (processedData.length > 0) {
        return {
          url,
          status: "success",
          result: processedData,
          multipleApis: processedData.length > 1
        };
      }
    }
    
    // If structured extraction failed, fall back to text-based analysis
    const { text } = await scrapeDataWithPuppeteer(url);
    
    // Check if the URL contains API documentation
    if (!isApiDocumentation(text)) {
      return {
        url,
        status: "skipped",
        reason: "Not API documentation",
      };
    }
    
    // If it is API documentation but we couldn't extract structured data,
    // return an error suggesting to use the AI-based processor instead
    return {
      url,
      status: "error",
      error: "Could not extract structured API data. Consider using the AI-based processor instead."
    };
  } catch (error) {
    return {
      url,
      status: "error",
      error: error instanceof Error ? error.message : "An error occurred",
    };
  }
}

/**
 * Main function for Puppeteer-based processing of API endpoints
 * @param apiEndpointUrls Array of API endpoint URLs
 * @returns Array of API results
 */
export async function processApiEndpointsWithPuppeteer(apiEndpointUrls: string[]): Promise<ApiResult[]> {
  // Process API endpoints in batches to avoid overwhelming the system
  const batchSize = 3; // Smaller batch size for Puppeteer to manage resources
  const results: ApiResult[] = [];
  
  for (let i = 0; i < apiEndpointUrls.length; i += batchSize) {
    const batch = apiEndpointUrls.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(apiEndpointUrls.length / batchSize)} with Puppeteer`);
    
    // Process endpoints sequentially within each batch to avoid browser instance conflicts
    for (const url of batch) {
      console.log(`Processing ${url} with Puppeteer`);
      const result = await processApiEndpointWithPuppeteer(url);
      results.push(result);
    }
  }
  
  return results;
} 