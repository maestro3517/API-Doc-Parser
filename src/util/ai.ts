import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from 'uuid';

// Common prompt for all models
export const getPrompt = (data: string) => {
  // Generate a unique ID for this action
  const actionId = `action_${uuidv4()}`;
  
  return `
IMPORTANT INSTRUCTION: Your response must be ONLY a raw JSON object without any markdown formatting or code block syntax.

This data is from an API doc website. Analyze the documentation data and convert it to the following JSON format:

{
    "id": "${actionId}",
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
}

IMPORTANT INSTRUCTIONS:
1. DO NOT return the template as-is. You MUST replace all placeholder values with actual data from the documentation.
2. The "step_name" should be a clear, concise name for the API endpoint.
3. The "action" should be a snake_case verb_noun combination that describes the action.
4. For prerequisites, include only user-facing requirements with the field name as the key and the requirement as the value.
5. Do not put API authentication details, rate limits, or configuration details in prerequisites.
6. Keep the "id" field exactly as provided in the template. This is a unique identifier for this action.
7. Do not wrap your response in \`\`\`json or any other markdown formatting. Return the raw JSON only.

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

// Function to use AI to find the most relevant action for a prerequisite
export async function findRelevantActionWithAI(
  prerequisiteText: string,
  actions: ProcessedApiData[],
  currentActionId: string,
  apiKey?: string
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
    
    // Use Gemini for faster processing
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = getRelevantActionPrompt(prerequisiteText, otherActions);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text() || "{}";
    
    // Parse the AI response
    try {
      // Clean the response
      let cleanedText = responseText;
      
      // Remove markdown code blocks if present
      if (cleanedText.includes('```')) {
        const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          cleanedText = jsonMatch[1];
        }
      }
      
      // Extract JSON object if embedded in other text
      const jsonMatch = cleanedText.match(/\{(?:[^{}]*|\{(?:[^{}]*|\{[^{}]*\})*\})*\}/);
      if (jsonMatch && jsonMatch[0]) {
        cleanedText = jsonMatch[0];
      }
      
      // Clean up any extra whitespace
      cleanedText = cleanedText.trim();
      
      // Parse the JSON
      const result = JSON.parse(cleanedText);
      
      // Check if we got a valid actionId
      if (result && result.actionId && result.actionId !== "null") {
        // Find the action with the matching ID
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
  // Check for template placeholder values
  const placeholderPatterns = [
    /REPLACE WITH/i,
    /ACTUAL API/i,
    /APPROPRIATE ACTION/i
  ];
  
  // Check step_name and action fields
  if (placeholderPatterns.some(pattern => pattern.test(action.step_name)) || 
      placeholderPatterns.some(pattern => pattern.test(action.action))) {
    return true;
  }
  
  // Check if it's the Google SERP example
  if (action.step_name === "Search Google for Keyword" && 
      action.action === "get_google_serp" &&
      action.api_config.url === "https://serpapi.com/search") {
    return true;
  }
  
  // Check if inputs contain placeholder values
  const inputsJson = JSON.stringify(action.inputs);
  if (placeholderPatterns.some(pattern => pattern.test(inputsJson))) {
    return true;
  }
  
  // Check if API config contains placeholder values
  const apiConfigJson = JSON.stringify(action.api_config);
  if (placeholderPatterns.some(pattern => pattern.test(apiConfigJson))) {
    return true;
  }
  
  return false;
}

// Function to validate and clean actions
function validateAndCleanActions(actions: ProcessedApiData[]): ProcessedApiData[] {
  return actions.filter(action => {
    // Filter out template responses
    if (isTemplateResponse(action)) {
      console.warn(`Filtered out template response with ID: ${action.id}`);
      return false;
    }
    
    // Ensure action has required fields
    if (!action.step_name || !action.action || !action.api_config.url || !action.api_config.method) {
      console.warn(`Filtered out incomplete action with ID: ${action.id}`);
      return false;
    }
    
    return true;
  });
}

// Function to link prerequisites between actions
export async function linkActionPrerequisites(
  actions: ProcessedApiData[],
  aiApiKey?: string
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
          aiApiKey
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
  aiApiKey?: string
): Promise<ProcessedApiData | null> {
  // First try with AI if an API key is provided
  if (aiApiKey) {
    try {
      const aiResult = await findRelevantActionWithAI(
        prerequisiteText,
        actions,
        currentActionId,
        aiApiKey
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
    const parsedData = JSON.parse(cleanedText) as ProcessedApiData;
    
    // Validate the parsed data
    if (isTemplateResponse(parsedData)) {
      console.warn("AI returned a template response without proper customization");
      
      // Return a basic error response
      return {
        id: parsedData.id || "",
        step_name: "Error: Template Response",
        action: "error_template_response",
        inputs: {},
        prerequisites: {},
        api_config: { 
          url: "", 
          method: "GET",
          passInputsAsQuery: false,
          auth: {
            type: "",
            key: "",
            paramName: ""
          },
          baseHeaders: {},
          rateLimit: {
            requestsPerMinute: null
          }
        },
        response_schema: {
          type: "object",
          properties: {}
        }
      };
    }
    
    return parsedData;
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    console.error("Raw response:", responseText);
    return {
      id: "",
      step_name: "Error",
      action: "error",
      inputs: {},
      prerequisites: {},
      api_config: { url: "", method: "" },
      response_schema: {},
    };
  }
}
