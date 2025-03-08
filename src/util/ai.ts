import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Common prompt for all models
export const getPrompt = (data: string) => `
IMPORTANT INSTRUCTION: Your response must be ONLY a raw JSON object without any markdown formatting or code block syntax.

This data is from an API doc website. Convert this data to the following JSON format:

{
    "step_name": "Search Google for Keyword",
    "action": "get_google_serp",
    "inputs": {
        "language_code": "en",
        "location_code": 2840,
        "q": "{input.keyword}"
    },
    "prerequisites": {
        // List only user-facing requirements that must be fulfilled before this API can be used
        // For example: "registered_sender": "Must have a registered and confirmed Sender Signature"
        // Do NOT include authentication details, rate limits, or API configuration information here
    },
    "api_config": {
        "url": "https://serpapi.com/search",
        "method": "GET",
        "passInputsAsQuery": true,
        "auth": {
            "type": "query",
            "key": "",
            "paramName": "api_key"
        },
        "baseHeaders": {
            "Content-Type": "application/json"
        },
        "rateLimit": {
            "requestsPerMinute": 60
        }
    },
    "response_schema": {
        "type": "object",
        "properties": {
            "organic_results": {
                "type": "array"
            }
        }
    }
}

Analyze the documentation data and fill in the JSON template above. Pay special attention to any prerequisites or requirements mentioned. 
For prerequisites, include only user-facing requirements (like account registration or setup steps) with the field name as the key and the requirement as the value. Do not put API authentication, rate limits, or configuration details in prerequisites as they belong in the api_config section.

IMPORTANT: Do not wrap your response in \`\`\`json or any other markdown formatting. Return the raw JSON only.

Documentation data: ${data}`;

// Prompt specifically designed for finding prerequisite URLs
export const getPrerequisiteUrlPrompt = (
  prerequisites: Record<string, string>,
  pageContent: string,
  pageUrl: string
) => `
IMPORTANT INSTRUCTION: Your response must be ONLY a raw JSON array without any markdown formatting or code block syntax.

I have a webpage with the URL: ${pageUrl}
I need to find URLs in this webpage that are relevant to specific prerequisites.

Prerequisites:
${JSON.stringify(prerequisites, null, 2)}

Page content contains HTML links. Extract all URLs that are related to these prerequisites.
Return results as a JSON array of strings containing only the full URLs.
Only include URLs that are directly related to satisfying these prerequisites.

IMPORTANT: 
- Return an empty array if no relevant URLs are found
- Return absolute URLs only
- Do not include any explanation, just the JSON array
- If a URL is relative, convert it to absolute using the base URL: ${pageUrl}

Page content:
${pageContent}
`;

export async function sendToOpenAI(
  data: string,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  const prompt = getPrompt(data);

  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-4o",
  });

  return completion.choices[0].message.content || "";
}

export async function sendToGemini(
  data: string,
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = getPrompt(data);

  const parsedData = await model.generateContent(prompt);
  const response = await parsedData.response;

  return response.text() || "";
}

// Function to send prerequisite URL finding request to Gemini
export async function findPrerequisiteUrlsWithAI(
  prerequisites: Record<string, string>,
  pageContent: string,
  pageUrl: string,
  apiKey: string
): Promise<string[]> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = getPrerequisiteUrlPrompt(prerequisites, pageContent, pageUrl);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text() || "[]";
    
    // Parse the AI response to get an array of URLs
    try {
      // Clean the response from any markdown code blocks or other formatting
      let cleanedText = responseText;
      
      // Remove markdown code blocks if present
      if (cleanedText.includes('```')) {
        const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          cleanedText = jsonMatch[1];
        }
      }
      
      // Clean up any extra whitespace
      cleanedText = cleanedText.trim();
      
      // Parse the cleaned JSON
      const urls = JSON.parse(cleanedText);
      return Array.isArray(urls) ? urls : [];
    } catch (parseError) {
      console.error("Failed to parse prerequisite URLs response:", parseError);
      return [];
    }
  } catch (error) {
    console.error("Error finding prerequisite URLs with AI:", error);
    return [];
  }
}

// Interface for the AI processed response
export interface ProcessedApiData {
  step_name: string;
  action: string;
  inputs: Record<string, any>;
  prerequisites: Record<string, string>;
  api_config: {
    url: string;
    method: string;
    [key: string]: any;
  };
  response_schema: Record<string, any>;
}

// Parse AI response to extract processed data
export function parseAiResponse(responseText: string): ProcessedApiData {
  try {
    // First, clean the response from any markdown code blocks or other formatting
    let cleanedText = responseText;
    
    // Remove markdown code blocks if present
    if (cleanedText.includes('```')) {
      const jsonMatch = cleanedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        cleanedText = jsonMatch[1];
      }
    }
    
    // Remove any leading/trailing non-JSON text
    const objectMatch = cleanedText.match(/(\{[\s\S]*\})/);
    if (objectMatch && objectMatch[1]) {
      cleanedText = objectMatch[1];
    }
    
    // Clean up any extra whitespace
    cleanedText = cleanedText.trim();
    
    console.log("Cleaned JSON text:", cleanedText);
    
    // Parse the cleaned JSON
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    console.error("Raw response:", responseText);
    return {
      step_name: "Error",
      action: "error",
      inputs: {},
      prerequisites: {},
      api_config: { url: "", method: "" },
      response_schema: {},
    };
  }
}
