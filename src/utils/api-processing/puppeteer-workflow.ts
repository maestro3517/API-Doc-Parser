import { scrapeRootPageWithPuppeteer } from "./stages/1-scraping-puppeteer";
import { processApiEndpointWithPuppeteer } from "./stages/2-processing-puppeteer";
import { linkPrerequisites } from "./stages/3-linking";

/**
 * Test version of the Puppeteer workflow that processes only one batch
 * This is a simplified version for testing the workflow
 * @param rootUrl The root URL to start scraping from
 * @param aiApiKey Optional API key for AI-based linking (if null, will use heuristic linking)
 * @param linkingModel The AI model to use for linking (if aiApiKey is provided)
 * @returns The complete workflow with linked prerequisites
 */
export async function createPuppeteerWorkflow(
  rootUrl: string,
  aiApiKey?: string,
  linkingModel: string = 'openai'
) {
  try {
    console.log(`Starting Puppeteer-based workflow for ${rootUrl}`);
    
    // Stage 1: Scrape the root page using Puppeteer
    console.log("Stage 1: Scraping with Puppeteer");
    const { apiEndpointUrls, subsectionUrls } = await scrapeRootPageWithPuppeteer(rootUrl);
    
    // Get the first batch of endpoints (either direct or from first subsection)
    let firstBatchEndpoints: string[] = [];
    
    if (apiEndpointUrls.length > 0) {
      // If we have direct endpoints, take the first batch
      firstBatchEndpoints = apiEndpointUrls.slice(0, 3);
      console.log(`Processing first batch of ${firstBatchEndpoints.length} direct API endpoints`);
    } else if (subsectionUrls.length > 0) {
      // If no direct endpoints, try the first subsection
      console.log("No direct API endpoints found, trying first subsection");
      try {
        const firstSubsection = subsectionUrls[0];
        const result = await scrapeRootPageWithPuppeteer(firstSubsection);
        firstBatchEndpoints = result.apiEndpointUrls.slice(0, 3);
        console.log(`Found ${firstBatchEndpoints.length} endpoints in first subsection`);
      } catch (error) {
        console.error("Error processing subsection:", error);
      }
    }
    
    // If no endpoints found, return error
    if (firstBatchEndpoints.length === 0) {
      return {
        status: "error",
        error: "No API endpoints found in first batch",
        rootUrl
      };
    }
    
    // Stage 2: Process the first batch of endpoints
    console.log(`Processing ${firstBatchEndpoints.length} endpoints with Puppeteer`);
    const processedResults = [];
    
    for (const url of firstBatchEndpoints) {
      try {
        console.log(`Processing ${url}`);
        const result = await processApiEndpointWithPuppeteer(url);

        console.log(result);

        processedResults.push(result);
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        processedResults.push({
          url,
          status: "error",
          error: error instanceof Error ? error.message : "An error occurred"
        });
      }
    }
    
    // Stage 3: Link prerequisites for the processed batch
    console.log("Stage 3: Linking prerequisites");
    const linkedResults = await linkPrerequisites(processedResults, aiApiKey, linkingModel);
    
    // Return results for the first batch
    return {
      status: "success",
      rootUrl,
      results: linkedResults,
      stats: {
        totalEndpoints: firstBatchEndpoints.length,
        processedEndpoints: processedResults.length,
        successfulEndpoints: processedResults.filter(r => r.status === "success").length,
        failedEndpoints: processedResults.filter(r => r.status === "error").length,
        skippedEndpoints: processedResults.filter(r => r.status === "skipped").length
      }
    };
  } catch (error) {
    console.error("Error in Puppeteer workflow:", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : "An unknown error occurred",
      rootUrl
    };
  }
} 