import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from 'uuid';

// Common prompt for all models
export const getPrompt = (data: string, multipleApis: boolean = false) => {
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
};

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

// New prompt for identifying related actions based on prerequisites
export const getRelevantActionPrompt = (
  prerequisiteText: string,
  actions: ProcessedApiData[]
) => `
IMPORTANT INSTRUCTION: Analyze a prerequisite requirement and determine which action from a list is most likely to fulfill this requirement.
Return ONLY a JSON object with the format {"actionId": "id_of_most_relevant_action"} or {"actionId": null} if no action is relevant.

Prerequisite text: "${prerequisiteText}"

Available actions:
${JSON.stringify(actions.map(a => ({
  id: a.id,
  step_name: a.step_name,
  action: a.action,
  inputs: a.inputs,
  description: a.api_config.url
})), null, 2)}

Determine which action is most relevant to fulfilling the prerequisite. 
Consider semantic meaning, not just keyword matching.
If multiple actions could be relevant, select the one that is most directly related to the prerequisite.
If no action is sufficiently related to the prerequisite, return {"actionId": null}.
`;

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

// Function to use AI to find the most relevant action for a prerequisite
export async function findRelevantActionWithAI(
  prerequisiteText: string,
  actions: ProcessedApiData[],
  currentActionId: string,
  apiKey?: string,
  model?: string
): Promise<ProcessedApiData | null> {
  // Skip if no API key is provided
  if (!apiKey) {
    console.log("No API key provided for AI-based action matching, using heuristic approach");
    return null;
  }
  
  try {
    // Skip the current action itself
    const otherActions = actions.filter(a => a.id !== currentActionId);
    if (otherActions.length === 0) return null;

    let responseText;
    // Use the specified model for processing
    if (model === 'openai') {
      const openAI = new OpenAI({ apiKey });
      const prompt = getRelevantActionPrompt(prerequisiteText, otherActions);
      const result = await openAI.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o", // Specify the OpenAI model
      });
      // Access the content directly from the result
      responseText = result.choices[0].message.content || "{}";
    } else if (model === 'gemini') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = getRelevantActionPrompt(prerequisiteText, otherActions);
      const result = await geminiModel.generateContent(prompt);
      // Access the content directly from the result
      responseText = result.response.text() || "{}";
    } else {
      console.error("Invalid model specified");
      return null;
    }

    // Parse the AI response
    try {
      // Clean the response
      let cleanedText = responseText;

      // Remove markdown code blocks if present
      if (cleanedText.includes('```')) {
        const jsonMatch = cleanedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          cleanedText = jsonMatch[1];
        }
      }

      // Extract JSON object if embedded in other text
      const objectMatch = cleanedText.match(/(\{[\s\S]*\})/);
      if (objectMatch && objectMatch[1]) {
        cleanedText = objectMatch[1];
      }

      // Clean up any extra whitespace
      cleanedText = cleanedText.trim();

      const result = JSON.parse(cleanedText);

      // Check if we got a valid actionId
      if (result && result.actionId && result.actionId !== "null") {
        const matchedAction = otherActions.find(a => a.id === result.actionId);
        if (matchedAction) {
          console.log(`AI found matching action for prerequisite "${prerequisiteText.substring(0, 30)}...": ${matchedAction.step_name}`);
          return matchedAction;
        }
      } else {
        console.log(`AI found no matching action for prerequisite "${prerequisiteText.substring(0, 30)}..."`);
      }

      return null;
    } catch (parseError) {
      console.error("Failed to parse AI action matching response:", parseError);
      return null;
    }
  } catch (error) {
    console.error("Error finding relevant action with AI:", error);
    return null;
  }
}

// Interface for prerequisite reference
export interface PrerequisiteReference {
  id: string;
  description: string;
  action_name: string;
}

// Interface for the AI processed response
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

// Function to check if an action is a template/example response
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

// Function to validate and clean actions
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

// Function to link prerequisites between actions
export async function linkActionPrerequisites(
  actions: ProcessedApiData[],
  aiApiKey?: string,
  model?: string
): Promise<ProcessedApiData[]> {
  if (!actions || actions.length <= 1) {
    return actions; // Nothing to link if there are 0 or 1 actions
  }

  // First, validate and clean the actions
  const validActions = validateAndCleanActions(actions);
  
  // If no valid actions remain, return the original set
  if (validActions.length === 0) {
    console.warn("No valid actions found after validation. Returning original actions.");
    return actions;
  }
  
  // Create a deep copy of the valid actions to avoid mutating the original
  const linkedActions = JSON.parse(JSON.stringify(validActions)) as ProcessedApiData[];
  
  // For each action, process its prerequisites
  for (const action of linkedActions) {
    // Skip if no prerequisites
    if (!action.prerequisites || Object.keys(action.prerequisites).length === 0) {
      continue;
    }
    
    // For each prerequisite, find the most relevant action
    for (const [prereqKey, prereqValue] of Object.entries(action.prerequisites)) {
      // Skip if already a reference object
      if (typeof prereqValue !== 'string') {
        continue;
      }
      
      // Skip if prerequisite text is too short or generic
      if (typeof prereqValue === 'string' && prereqValue.length < 10) {
        continue;
      }
      
      // Find the most relevant action for this prerequisite
      try {
        const relevantAction = await findMostRelevantAction(
          prereqValue, 
          linkedActions, 
          action.id,
          aiApiKey,
          model
        );
        
        if (relevantAction) {
          // Convert the prerequisite value to an object with id and description
          action.prerequisites[prereqKey] = {
            id: relevantAction.id,
            description: prereqValue,
            action_name: relevantAction.step_name
          };
        }
      } catch (error) {
        console.error(`Error finding relevant action for prerequisite "${prereqKey}":`, error);
      }
    }
  }
  
  return linkedActions;
}

// Helper function to find the most relevant action for a prerequisite
async function findMostRelevantAction(
  prerequisiteText: string, 
  actions: ProcessedApiData[],
  currentActionId: string,
  aiApiKey?: string,
  model?: string
): Promise<ProcessedApiData | null> {
  // First try with AI if an API key is provided
  if (aiApiKey) {
    try {
      const aiResult = await findRelevantActionWithAI(
        prerequisiteText,
        actions,
        currentActionId,
        aiApiKey,
        model
      );
      
      if (aiResult) {
        return aiResult;
      }
      
      // If AI didn't find a match, fall back to heuristic approach
      console.log("AI didn't find a strong match, falling back to heuristic approach");
    } catch (error) {
      console.error("Error using AI for action matching:", error);
      console.log("Falling back to heuristic approach");
    }
  }
  
  // Fallback to heuristic approach
  return findMostRelevantActionHeuristic(prerequisiteText, actions, currentActionId);
}

// Original heuristic-based approach (renamed from findMostRelevantAction)
function findMostRelevantActionHeuristic(
  prerequisiteText: string, 
  actions: ProcessedApiData[],
  currentActionId: string
): ProcessedApiData | null {
  // Skip the current action itself
  const otherActions = actions.filter(a => a.id !== currentActionId);
  if (otherActions.length === 0) return null;
  
  // Extract meaningful keywords from the prerequisite text
  const lowerPrereq = prerequisiteText.toLowerCase();
  const prereqWords = lowerPrereq
    .split(/\s+/)
    .filter(word => 
      word.length > 3 && 
      ![
        "must", "have", "need", "required", "should", "with", "your",
        "this", "that", "these", "those", "will", "been", "being",
        "from", "they", "them", "their", "there", "here", "where",
        "when", "what", "which", "who", "whom", "whose", "how"
      ].includes(word)
    );
  
  // Calculate relevance scores for each action
  const scoredActions = otherActions.map(action => {
    // Calculate a simple relevance score based on text matching
    let score = 0;
    
    // Check action name
    const lowerActionName = action.step_name.toLowerCase();
    
    // Exact match or contains relationship between action name and prerequisite
    if (lowerActionName === lowerPrereq) {
      score += 10; // Exact match is highly relevant
    } else if (lowerActionName.includes(lowerPrereq) || lowerPrereq.includes(lowerActionName)) {
      score += 5;
    }
    
    // Check action inputs for relevance
    const inputsJson = JSON.stringify(action.inputs).toLowerCase();
    
    // Check for key terms in the action's inputs
    for (const word of prereqWords) {
      if (inputsJson.includes(word)) {
        score += 2; // Inputs are highly relevant
      }
    }
    
    // Check action description in all fields
    const actionJson = JSON.stringify(action).toLowerCase();
    
    // Count matching keywords
    let matchingKeywords = 0;
    for (const word of prereqWords) {
      if (actionJson.includes(word)) {
        matchingKeywords++;
        score += 1;
      }
    }
    
    // Bonus for high percentage of matching keywords
    if (prereqWords.length > 0) {
      const matchPercentage = matchingKeywords / prereqWords.length;
      if (matchPercentage > 0.7) {
        score += 3; // Most keywords match
      } else if (matchPercentage > 0.5) {
        score += 2; // Half of keywords match
      }
    }
    
    // Check for domain-specific terms that indicate strong relationships
    const domainTerms = [
      { term: "register", related: ["account", "user", "signup", "create"] },
      { term: "authenticate", related: ["login", "token", "key", "credential"] },
      { term: "verify", related: ["confirm", "validate", "check"] },
      { term: "permission", related: ["access", "right", "authorize"] },
      { term: "setup", related: ["configure", "setting", "initialize"] }
    ];
    
    // Check for domain term matches
    for (const { term, related } of domainTerms) {
      if (lowerPrereq.includes(term)) {
        for (const relatedTerm of related) {
          if (actionJson.includes(relatedTerm)) {
            score += 2; // Domain-specific relationship
            break;
          }
        }
      }
    }
    
    return { action, score };
  });
  
  // Sort by score (descending)
  scoredActions.sort((a, b) => b.score - a.score);
  
  // Log the top scoring actions for debugging
  if (scoredActions.length > 0) {
    console.log(`Top scoring actions for prerequisite "${prerequisiteText.substring(0, 30)}...":`);
    scoredActions.slice(0, 3).forEach(({ action, score }) => {
      console.log(`- ${action.step_name} (Score: ${score})`);
    });
  }
  
  // Return the most relevant action if it has a minimum score
  // Increased minimum score threshold for more confident matches
  return scoredActions.length > 0 && scoredActions[0].score >= 5 
    ? scoredActions[0].action 
    : null;
}

// Parse AI response to extract processed data
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
