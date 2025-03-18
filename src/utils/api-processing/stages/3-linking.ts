import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ProcessedApiData, PrerequisiteReference } from "./2-processing";

/**
 * Generates a prompt for finding prerequisite URLs
 * @param prerequisites The prerequisites to find URLs for
 * @param pageContent The content of the page
 * @param pageUrl The URL of the page
 * @returns A prompt string for the AI model
 */
export function getPrerequisiteUrlPrompt(
  prerequisites: Record<string, string>,
  pageContent: string,
  pageUrl: string
): string {
  return `
You are analyzing API documentation to find URLs that satisfy specific prerequisites.

Current page URL: ${pageUrl}

Prerequisites to find URLs for:
${Object.entries(prerequisites)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

Page content:
${pageContent.substring(0, 5000)}... (content truncated for brevity)

TASK:
1. Analyze the page content and identify URLs that would help fulfill the listed prerequisites.
2. Return ONLY a JSON array of URLs found in the page content that are relevant to the prerequisites.
3. If no relevant URLs are found, return an empty array.

Example response format:
["https://example.com/register", "https://example.com/verify"]

Your response should be ONLY the JSON array, with no additional text or explanation.
`;
}

/**
 * Generates a prompt for finding relevant actions
 * @param prerequisiteText The prerequisite text
 * @param actions The actions to search through
 * @returns A prompt string for the AI model
 */
export function getRelevantActionPrompt(
  prerequisiteText: string,
  actions: ProcessedApiData[]
): string {
  return `
You are analyzing API documentation to find which API endpoint would fulfill a specific prerequisite.

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
}

/**
 * Finds prerequisite URLs using AI
 * @param prerequisites The prerequisites to find URLs for
 * @param pageContent The content of the page
 * @param pageUrl The URL of the page
 * @param apiKey The API key for the AI model
 * @param model The AI model to use
 * @returns An array of URLs
 */
export async function findPrerequisiteUrlsWithAI(
  prerequisites: Record<string, string>,
  pageContent: string,
  pageUrl: string,
  apiKey: string,
  model: string = 'openai'
): Promise<string[]> {
  try {
    const prompt = getPrerequisiteUrlPrompt(prerequisites, pageContent, pageUrl);
    
    let response: string;
    if (model === 'openai') {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o",
      });
      response = completion.choices[0].message.content || "[]";
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await genModel.generateContent(prompt);
      response = await result.response.text() || "[]";
    }
    
    // Clean up the response
    response = response.trim();
    if (response.startsWith('```') && response.endsWith('```')) {
      response = response.substring(3, response.length - 3).trim();
      if (response.startsWith('json')) {
        response = response.substring(4).trim();
      }
    }
    
    try {
      const urls = JSON.parse(response) as string[];
      return Array.isArray(urls) ? urls : [];
    } catch (e) {
      console.error("Error parsing prerequisite URLs:", e);
      return [];
    }
  } catch (error) {
    console.error("Error finding prerequisite URLs:", error);
    return [];
  }
}

/**
 * Finds the most relevant action for a prerequisite using AI
 * @param prerequisiteText The prerequisite text
 * @param actions The actions to search through
 * @param currentActionId The ID of the current action
 * @param apiKey The API key for the AI model
 * @param model The AI model to use
 * @returns The most relevant action or null
 */
export async function findRelevantActionWithAI(
  prerequisiteText: string,
  actions: ProcessedApiData[],
  currentActionId: string,
  apiKey?: string,
  model: string = 'openai'
): Promise<ProcessedApiData | null> {
  // Filter out the current action from the list
  const otherActions = actions.filter(action => action.id !== currentActionId);
  
  if (otherActions.length === 0) {
    return null;
  }
  
  // If no API key is provided, use heuristic matching
  if (!apiKey) {
    return findMostRelevantActionHeuristic(prerequisiteText, otherActions, currentActionId);
  }
  
  try {
    const prompt = getRelevantActionPrompt(prerequisiteText, otherActions);
    
    let response: string;
    if (model === 'openai') {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "gpt-4o",
      });
      response = completion.choices[0].message.content || "";
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await genModel.generateContent(prompt);
      response = await result.response.text() || "";
    }
    
    // Clean up the response
    response = response.trim();
    if (response.startsWith('```') && response.endsWith('```')) {
      response = response.substring(3, response.length - 3).trim();
      if (response.startsWith('json')) {
        response = response.substring(4).trim();
      }
    }
    
    try {
      const result = JSON.parse(response) as { actionId: string | null };
      if (!result.actionId) {
        return null;
      }
      
      const relevantAction = otherActions.find(action => action.id === result.actionId);
      return relevantAction || null;
    } catch (e) {
      console.error("Error parsing relevant action:", e);
      return findMostRelevantActionHeuristic(prerequisiteText, otherActions, currentActionId);
    }
  } catch (error) {
    console.error("Error finding relevant action:", error);
    return findMostRelevantActionHeuristic(prerequisiteText, otherActions, currentActionId);
  }
}

/**
 * Finds the most relevant action for a prerequisite using heuristics
 * @param prerequisiteText The prerequisite text
 * @param actions The actions to search through
 * @param currentActionId The ID of the current action
 * @returns The most relevant action or null
 */
function findMostRelevantActionHeuristic(
  prerequisiteText: string, 
  actions: ProcessedApiData[],
  currentActionId: string
): ProcessedApiData | null {
  // Skip if there are no other actions
  if (actions.length === 0) {
    return null;
  }
  
  // Convert prerequisite text to lowercase for case-insensitive matching
  const prerequisiteLower = prerequisiteText.toLowerCase();
  
  // Extract key terms from the prerequisite text
  const keyTerms = prerequisiteLower
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 3)
    .filter(term => !['must', 'have', 'need', 'requires', 'required', 'should', 'with', 'that', 'this', 'from', 'your'].includes(term));
  
  // Score each action based on relevance to the prerequisite
  const scoredActions = actions.map(action => {
    // Skip the current action
    if (action.id === currentActionId) {
      return { action, score: -1 };
    }
    
    // Combine relevant fields for matching
    const actionText = [
      action.step_name,
      action.action,
      Object.keys(action.inputs).join(' '),
      action.api_config.url,
      action.api_config.method
    ].join(' ').toLowerCase();
    
    // Calculate score based on key term matches
    let score = 0;
    for (const term of keyTerms) {
      if (actionText.includes(term)) {
        score += 1;
        
        // Boost score for exact matches in step_name or action
        if (action.step_name.toLowerCase().includes(term) || 
            action.action.toLowerCase().includes(term)) {
          score += 2;
        }
      }
    }
    
    // Boost score for create/register actions if prerequisite mentions registration
    if ((prerequisiteLower.includes('register') || 
         prerequisiteLower.includes('create') || 
         prerequisiteLower.includes('setup') || 
         prerequisiteLower.includes('set up')) && 
        (action.action.includes('create') || 
         action.action.includes('register') || 
         action.action.includes('setup'))) {
      score += 3;
    }
    
    // Boost score for verification actions if prerequisite mentions verification
    if ((prerequisiteLower.includes('verify') || 
         prerequisiteLower.includes('confirm') || 
         prerequisiteLower.includes('validate')) && 
        (action.action.includes('verify') || 
         action.action.includes('confirm') || 
         action.action.includes('validate'))) {
      score += 3;
    }
    
    return { action, score };
  });
  
  // Sort actions by score in descending order
  scoredActions.sort((a, b) => b.score - a.score);
  
  // Return the highest-scoring action if it has a positive score
  return scoredActions[0]?.score > 0 ? scoredActions[0].action : null;
}

/**
 * Links action prerequisites to other actions
 * @param actions The actions to link
 * @param aiApiKey The API key for the AI model
 * @param model The AI model to use
 * @returns The linked actions
 */
export async function linkActionPrerequisites(
  actions: ProcessedApiData[],
  aiApiKey?: string,
  model: string = 'openai'
): Promise<ProcessedApiData[]> {
  // Create a deep copy of the actions to avoid modifying the original
  const linkedActions = JSON.parse(JSON.stringify(actions)) as ProcessedApiData[];
  
  // Process each action
  for (const action of linkedActions) {
    // Skip if the action has no prerequisites
    if (!action.prerequisites || Object.keys(action.prerequisites).length === 0) {
      continue;
    }
    
    // Process each prerequisite
    for (const [key, value] of Object.entries(action.prerequisites)) {
      // Skip if the prerequisite is already a reference
      if (typeof value !== 'string') {
        continue;
      }
      
      // Find the most relevant action for this prerequisite
      const relevantAction = await findRelevantActionWithAI(
        value,
        linkedActions,
        action.id,
        aiApiKey,
        model
      );
      
      // If a relevant action is found, replace the prerequisite with a reference
      if (relevantAction) {
        action.prerequisites[key] = {
          id: relevantAction.id,
          description: value,
          action_name: relevantAction.step_name
        };
      }
    }
  }
  
  return linkedActions;
}

/**
 * Main function for stage 3: Linking prerequisites
 * @param results The results from stage 2
 * @param apiKey The API key for the AI model
 * @param model The AI model to use
 * @returns The linked results
 */
export async function linkPrerequisites(
  results: any[],
  apiKey?: string,
  model: string = 'openai'
): Promise<any[]> {
  // Extract successful results with valid API data
  const successfulResults = results.filter(
    result => result.status === "success"
  );
  
  // Extract all successful API data for linking
  const successfulActions = successfulResults
    .flatMap(result => {
      if (result.multipleApis && Array.isArray(result.result)) {
        return result.result;
      } else if (!Array.isArray(result.result)) {
        return [result.result];
      }
      return [];
    })
    .filter((action): action is ProcessedApiData => action !== undefined);
  
  // Link prerequisites between actions
  const linkedActions = await linkActionPrerequisites(successfulActions, apiKey, model);
  
  // Update the results with the linked actions
  const linkedResults = results.map(result => {
    if (result.status === "success") {
      if (result.multipleApis && Array.isArray(result.result)) {
        // Handle array of API data
        const linkedApiResults = result.result.map((apiData: ProcessedApiData) => {
          const linkedAction = linkedActions.find(action => action.id === apiData.id);
          return linkedAction || apiData;
        });
        
        return {
          ...result,
          result: linkedApiResults
        };
      } else if (!Array.isArray(result.result)) {
        // Handle single API data object
        const singleResult = result.result as ProcessedApiData;
        const linkedAction = linkedActions.find(action => action.id === singleResult.id);
        if (linkedAction) {
          return {
            ...result,
            result: linkedAction
          };
        }
      }
    }
    return result;
  });
  
  return linkedResults;
} 