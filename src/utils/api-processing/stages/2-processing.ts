import { v4 as uuidv4 } from "uuid";
import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from "cheerio";
import { scrapeData, isApiDocumentation } from "./1-scraping";

// Define types for API results
export interface ApiSuccessResult {
  url: string;
  status: "success";
  result: ProcessedApiData | ProcessedApiData[];
  multipleApis?: boolean;
}

export interface ApiErrorResult {
  url: string;
  status: "error";
  error: string;
}

export interface ApiSkippedResult {
  url: string;
  status: "skipped";
  reason: string;
}

export type ApiResult = ApiSuccessResult | ApiErrorResult | ApiSkippedResult;

export interface PrerequisiteReference {
  id: string;
  description: string;
  action_name: string;
}

export interface ProcessedApiData {
  id: string;
  step_name: string;
  action: string;
  inputs: Record<string, any>;
  prerequisites: Record<string, string | PrerequisiteReference>;
  api_config: {
    url: string;
    method: string;
    [key: string]: any;
  };
  response_schema: Record<string, any>;
}

/**
 * Analyzes scraped content to determine if it likely contains multiple API endpoints
 * @param content The scraped text content from the page
 * @returns Boolean indicating if the page likely contains multiple API endpoints
 */
export function detectMultipleApiEndpoints(content: string): boolean {
  // Count occurrences of common API endpoint indicators
  const endpointIndicators = [
    /\bGET\s+[\/\w]+/gi,
    /\bPOST\s+[\/\w]+/gi,
    /\bPUT\s+[\/\w]+/gi,
    /\bDELETE\s+[\/\w]+/gi,
    /\bPATCH\s+[\/\w]+/gi,
    /\bAPI\s+Endpoint\b/gi,
    /\bEndpoint\s*:/gi,
    /\bURL\s*:/gi,
    /\bRequest\s+URL\b/gi,
    /\bHTTP\s+Method\b/gi
  ];

  // Count the number of potential API endpoint indicators
  let endpointCount = 0;
  for (const pattern of endpointIndicators) {
    const matches = content.match(pattern);
    if (matches) {
      endpointCount += matches.length;
    }
  }

  // Look for sections that might indicate multiple endpoints
  const sectionIndicators = [
    /\bEndpoints\b/gi,
    /\bAPI\s+Reference\b/gi,
    /\bAvailable\s+Methods\b/gi,
    /\bResource\s+Types\b/gi,
    /\bAPI\s+Resources\b/gi,
    /\bList\s+of\s+APIs\b/gi,
    /\bAPI\s+Listing\b/gi
  ];

  let hasSectionIndicators = false;
  for (const pattern of sectionIndicators) {
    if (pattern.test(content)) {
      hasSectionIndicators = true;
      break;
    }
  }

  // Look for multiple HTTP method sections
  const methodSections = [
    content.match(/\bGET\b/gi)?.length || 0,
    content.match(/\bPOST\b/gi)?.length || 0,
    content.match(/\bPUT\b/gi)?.length || 0,
    content.match(/\bDELETE\b/gi)?.length || 0,
    content.match(/\bPATCH\b/gi)?.length || 0
  ];
  
  // Count how many different HTTP methods are mentioned multiple times
  const methodsWithMultipleOccurrences = methodSections.filter(count => count > 1).length;
  
  // Check for multiple URL patterns
  const urlPatterns = content.match(/https?:\/\/[^\s"']+\/[^\s"']+/gi) || [];
  const apiUrlPatterns = urlPatterns.filter(url => 
    url.includes('/api/') || 
    url.includes('/v1/') || 
    url.includes('/v2/') || 
    url.includes('/rest/')
  );
  
  // Check for numbered sections that might indicate multiple endpoints
  const numberedSections = content.match(/\b\d+\.\s+[A-Z][a-zA-Z\s]+API\b/gi) || [];
  
  // If we have multiple endpoint indicators or section indicators suggesting multiple endpoints
  return (
    endpointCount > 1 || 
    hasSectionIndicators || 
    methodsWithMultipleOccurrences >= 2 || 
    apiUrlPatterns.length > 1 ||
    numberedSections.length > 0
  );
}

/**
 * Analyzes HTML structure to detect if a page likely contains multiple API endpoints
 * @param $ Cheerio instance loaded with the page HTML
 * @returns Boolean indicating if the page likely contains multiple API endpoints based on HTML structure
 */
export function detectMultipleApisFromHtml($: cheerio.CheerioAPI | cheerio.Root): boolean {
  // Check for multiple API endpoint sections based on common HTML patterns
  
  // Count API-related headings (h1, h2, h3, etc.)
  const apiHeadings = $('h1, h2, h3, h4, h5, h6').filter((_, el: cheerio.Element) => {
    const text = $(el).text().toLowerCase();
    return text.includes('api') || 
           text.includes('endpoint') || 
           text.includes('method') ||
           text.includes('request') ||
           text.includes('resource');
  }).length;
  
  // Look for tables that might contain API information
  const apiTables = $('table').filter((_, el: cheerio.Element) => {
    const tableText = $(el).text().toLowerCase();
    return tableText.includes('api') || 
           tableText.includes('endpoint') || 
           tableText.includes('method') ||
           tableText.includes('url') ||
           tableText.includes('request');
  }).length;
  
  // Look for divs or sections with API-related classes or IDs
  const apiSections = $('div, section').filter((_, el: cheerio.Element) => {
    const id = $(el).attr('id') || '';
    const className = $(el).attr('class') || '';
    const idAndClass = (id + ' ' + className).toLowerCase();
    
    return idAndClass.includes('api') || 
           idAndClass.includes('endpoint') || 
           idAndClass.includes('method') ||
           idAndClass.includes('resource');
  }).length;
  
  // Count code blocks that might contain different API examples
  const codeBlocks = $('pre, code').length;
  
  // Return true if we find multiple indicators of API documentation
  return (apiHeadings > 1) || (apiTables > 1) || (apiSections > 1) || (codeBlocks > 2);
}

/**
 * Generates a prompt for the AI model to extract API information
 * @param data The text content from the API documentation
 * @param multipleApis Whether the page contains multiple API endpoints
 * @returns A prompt string for the AI model
 */
export function getPrompt(data: string, multipleApis: boolean = false) {
  // Generate a unique ID for this action
  const actionId = `action_${uuidv4()}`;
  
  return `
IMPORTANT INSTRUCTION: ${multipleApis ? 'This page may contain MULTIPLE API endpoints. You must identify each distinct API endpoint and return an ARRAY of JSON objects, one for each endpoint. Each endpoint should have its own complete JSON object.' : 'Your response must be ONLY a raw JSON object without any markdown formatting or code block syntax.'}

This data is from an API doc website. Analyze the documentation data and convert it to the following JSON format:

${multipleApis ? '[' : ''}
{
    "id": "${multipleApis ? 'action_[UNIQUE_ID]' : actionId}",
    "step_name": "REPLACE WITH ACTUAL API NAME",
    "action": "REPLACE WITH APPROPRIATE ACTION NAME",
    "inputs": {
        // REPLACE WITH ACTUAL API INPUTS FROM THE DOCUMENTATION
    },
    "prerequisites": {
        // List only user-facing requirements that must be fulfilled before this API can be used
        // For example: "registered_sender": "Must have a registered and confirmed Sender Signature"
        // DO NOT COPY THIS EXAMPLE - extract real prerequisites from the documentation
        // DO NOT include authentication details, rate limits, or API configuration information here
    },
    "api_config": {
        "url": "REPLACE WITH ACTUAL API URL",
        "method": "REPLACE WITH ACTUAL HTTP METHOD (GET, POST, PUT, DELETE, etc.)",
        "passInputsAsQuery": true or false,
        "auth": {
            "type": "REPLACE WITH AUTH TYPE (header, query, etc.)",
            "key": "REPLACE WITH AUTH KEY NAME",
            "paramName": "REPLACE WITH AUTH PARAM NAME"
        },
        "baseHeaders": {
            // REPLACE WITH ACTUAL REQUIRED HEADERS
        },
        "rateLimit": {
            "requestsPerMinute": null // REPLACE WITH ACTUAL RATE LIMIT IF SPECIFIED
        }
    },
    "response_schema": {
        "type": "object",
        "properties": {
            // REPLACE WITH ACTUAL RESPONSE PROPERTIES
        }
    }
}${multipleApis ? ',\n// Add more API objects as needed\n]' : ''}

IMPORTANT INSTRUCTIONS:
1. DO NOT return the template as-is. You MUST replace all placeholder values with actual data from the documentation.
2. The "step_name" should be a clear, concise name for the API endpoint.
3. The "action" should be a snake_case verb_noun combination that describes the action.
4. For prerequisites, include only user-facing requirements with the field name as the key and the requirement as the value.
5. Do not put API authentication details, rate limits, or configuration details in prerequisites.
6. ${multipleApis ? 'For each API endpoint, generate a unique ID using the format "action_[uuid]". Each endpoint must have a different ID.' : ''}
7. Do not wrap your response in \`\`\`json or any other markdown formatting. Return the raw JSON only.
${multipleApis ? '8. If you identify multiple distinct API endpoints, return an array of JSON objects. If there is only one API endpoint, still return it within an array.\n9. Make sure each API endpoint is complete and has all required fields filled in.' : ''}

${multipleApis ? 'IMPORTANT: Each API endpoint should be represented as a separate, complete JSON object in the array. Do not combine multiple endpoints into a single object.' : ''}

Documentation data: ${data}`;
}

/**
 * Sends data to OpenAI for processing
 * @param data The text content from the API documentation
 * @param apiKey The OpenAI API key
 * @param detectMultipleApis Whether to detect multiple API endpoints
 * @returns The response from OpenAI
 */
export async function sendToOpenAI(
  data: string,
  apiKey: string,
  detectMultipleApis: boolean = true
): Promise<string> {
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  const prompt = getPrompt(data, detectMultipleApis);

  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-4o",
  });

  return completion.choices[0].message.content || "";
}

/**
 * Sends data to Google's Gemini for processing
 * @param data The text content from the API documentation
 * @param apiKey The Gemini API key
 * @param detectMultipleApis Whether to detect multiple API endpoints
 * @returns The response from Gemini
 */
export async function sendToGemini(
  data: string,
  apiKey: string,
  detectMultipleApis: boolean = true
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = getPrompt(data, detectMultipleApis);

  const parsedData = await model.generateContent(prompt);
  const response = await parsedData.response;

  return response.text() || "";
}

/**
 * Checks if an action is a template response
 * @param action The processed API data
 * @returns Boolean indicating if the action is a template response
 */
function isTemplateResponse(action: ProcessedApiData): boolean {
  // Check if the response contains placeholder text that indicates it's a template
  const placeholderTexts = [
    "REPLACE WITH",
    "ACTUAL API",
    "REPLACE THIS",
    "EXAMPLE",
    "PLACEHOLDER"
  ];
  
  // Check step_name and action fields
  if (
    placeholderTexts.some(text => 
      action.step_name.includes(text) || 
      action.action.includes(text)
    )
  ) {
    return true;
  }
  
  // Check if the API config URL is a placeholder
  if (
    placeholderTexts.some(text => 
      action.api_config.url.includes(text)
    )
  ) {
    return true;
  }
  
  return false;
}

/**
 * Validates and cleans actions
 * @param actions Array of processed API data
 * @returns Array of validated and cleaned API data
 */
function validateAndCleanActions(actions: ProcessedApiData[]): ProcessedApiData[] {
  return actions.filter(action => {
    // Skip template responses
    if (isTemplateResponse(action)) {
      console.warn(`Skipping template response: ${action.step_name}`);
      return false;
    }
    
    // Ensure required fields are present
    if (!action.id || !action.step_name || !action.action || !action.api_config || !action.api_config.url) {
      console.warn(`Skipping invalid action missing required fields: ${JSON.stringify(action)}`);
      return false;
    }
    
    return true;
  });
}

/**
 * Attempts to fix common issues with broken JSON arrays
 * @param jsonText The potentially broken JSON array text
 * @returns Fixed JSON array text
 */
function cleanFixBrokenJsonArray(jsonText: string): string {
  let text = jsonText.trim();
  
  // Ensure it starts with [ and ends with ]
  if (!text.startsWith('[')) text = '[' + text;
  if (!text.endsWith(']')) text = text + ']';
  
  // Fix missing commas between objects
  text = text.replace(/}\s*{/g, '},{');
  
  // Fix trailing commas before closing bracket
  text = text.replace(/,\s*]/g, ']');
  
  return text;
}

/**
 * Attempts to fix common issues with broken JSON objects
 * @param jsonText The potentially broken JSON object text
 * @returns Fixed JSON object text
 */
function cleanFixBrokenJsonObject(jsonText: string): string {
  let text = jsonText.trim();
  
  // Ensure it starts with { and ends with }
  if (!text.startsWith('{')) text = '{' + text;
  if (!text.endsWith('}')) text = text + '}';
  
  // Fix trailing commas
  text = text.replace(/,\s*}/g, '}');
  
  return text;
}

/**
 * Parses the AI response to extract processed API data
 * @param responseText The response text from the AI model
 * @returns Processed API data or array of processed API data
 */
export function parseAiResponse(responseText: string): ProcessedApiData | ProcessedApiData[] {
  try {
    // First, clean the response from any markdown code blocks or other formatting
    let cleanedText = responseText;
    
    // Remove markdown code blocks if present
    if (cleanedText.includes('```')) {
      const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        cleanedText = jsonMatch[1];
      }
    }
    
    // Check if the response is an array or a single object
    const isArray = cleanedText.trim().startsWith('[') && cleanedText.trim().endsWith(']');
    
    if (isArray) {
      // Handle array of API data
      const objectMatch = cleanedText.match(/(\[[\s\S]*\])/);
      if (objectMatch && objectMatch[1]) {
        cleanedText = objectMatch[1];
      }
      
      // Parse the JSON array
      let parsedData: any;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (e) {
        console.error("Error parsing JSON array:", e);
        // Try to fix common JSON array parsing issues
        cleanedText = cleanFixBrokenJsonArray(cleanedText);
        parsedData = JSON.parse(cleanedText);
      }
      
      // Ensure the parsed data is an array
      if (!Array.isArray(parsedData)) {
        console.warn("Expected array but got:", typeof parsedData);
        // If we got a single object, wrap it in an array
        parsedData = [parsedData];
      }
      
      // Validate and clean the array of actions
      const validActions = validateAndCleanActions(parsedData);
      
      if (validActions.length === 0) {
        throw new Error("No valid API actions found in the response");
      }
      
      // Ensure each action has a unique ID
      const uniqueIds = new Set<string>();
      validActions.forEach(action => {
        if (!action.id) {
          // Generate a new ID if missing
          action.id = `action_${uuidv4()}`;
        } else if (uniqueIds.has(action.id)) {
          // Replace duplicate ID
          action.id = `action_${uuidv4()}`;
        }
        uniqueIds.add(action.id);
      });
      
      return validActions;
    } else {
      // Handle single API data object
      // Remove any leading/trailing non-JSON text
      const objectMatch = cleanedText.match(/(\{[\s\S]*\})/);
      if (objectMatch && objectMatch[1]) {
        cleanedText = objectMatch[1];
      }
      
      // Parse the JSON object
      let parsedData: any;
      try {
        parsedData = JSON.parse(cleanedText) as ProcessedApiData;
      } catch (e) {
        console.error("Error parsing JSON object:", e);
        // Try to fix common JSON object parsing issues
        cleanedText = cleanFixBrokenJsonObject(cleanedText);
        parsedData = JSON.parse(cleanedText);
      }
      
      // Validate the single action
      if (isTemplateResponse(parsedData)) {
        throw new Error("AI returned a template response without proper customization");
      }
      
      if (!parsedData.id || !parsedData.step_name || !parsedData.action || !parsedData.api_config || !parsedData.api_config.url) {
        throw new Error("AI returned an invalid action missing required fields");
      }
      
      return parsedData;
    }
  } catch (error) {
    console.error("Error parsing AI response:", error);
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Processes a single API endpoint URL
 * @param url The URL to process
 * @param apiKey The API key for the AI model
 * @param model The AI model to use
 * @returns The API result
 */
export async function processApiEndpoint(url: string, apiKey: string, model: string = 'gemini'): Promise<ApiResult> {
  try {
    const { text, $ } = await scrapeData(url);
    
    // Check if the URL contains API documentation
    if (!isApiDocumentation(text)) {
      return {
        url,
        status: "skipped",
        reason: "Not API documentation",
      };
    }
    
    // Detect if the page likely contains multiple API endpoints using both text and HTML analysis
    const hasMultipleApisFromText = detectMultipleApiEndpoints(text);
    const hasMultipleApisFromHtml = $ ? detectMultipleApisFromHtml($) : false;
    const hasMultipleApis = hasMultipleApisFromText || hasMultipleApisFromHtml;
    
    console.log(`URL ${url} - Multiple APIs detected: ${hasMultipleApis} (text: ${hasMultipleApisFromText}, html: ${hasMultipleApisFromHtml})`);
    
    // Choose the appropriate AI model
    let result;
    if (model === 'openai') {
      result = await sendToOpenAI(text, apiKey, hasMultipleApis);
    } else {
      result = await sendToGemini(text, apiKey, hasMultipleApis);
    }
    
    const parsedData = parseAiResponse(result);

    // Handle array of API data
    if (Array.isArray(parsedData)) {
      return {
        url,
        status: "success",
        result: parsedData,
        multipleApis: true,
      };
    } else {
      // Handle single API data object
      return {
        url,
        status: "success",
        result: parsedData,
        multipleApis: false,
      };
    }
  } catch (error) {
    return {
      url,
      status: "error",
      error: error instanceof Error ? error.message : "An error occurred",
    };
  }
}

/**
 * Main function for stage 2: Processing the scraped data
 * @param apiEndpointUrls Array of API endpoint URLs
 * @param apiKey The API key for the AI model
 * @param model The AI model to use
 * @returns Array of API results
 */
export async function processApiEndpoints(apiEndpointUrls: string[], apiKey: string, model: string = 'gemini'): Promise<ApiResult[]> {
  // Process API endpoints in batches to avoid overwhelming the server
  const batchSize = 5;
  const results: ApiResult[] = [];
  
  for (let i = 0; i < apiEndpointUrls.length; i += batchSize) {
    const batch = apiEndpointUrls.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(apiEndpointUrls.length / batchSize)}`);
    
    const batchResults = await Promise.all(
      batch.map(url => processApiEndpoint(url, apiKey, model))
    );
    
    results.push(...batchResults);
  }
  
  return results;
} 