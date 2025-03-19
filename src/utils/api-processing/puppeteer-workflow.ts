import { scrapeRootPageWithPuppeteer } from "./stages/1-scraping-puppeteer";
import { processApiEndpointsWithPuppeteer, processApiEndpointWithPuppeteer } from "./stages/2-processing-puppeteer";
import { linkPrerequisites } from "./stages/3-linking";

// Define types for progress updates
export type ProcessingProgressUpdate = {
  type: 'scraping_start' | 'scraping_complete' | 'processing_start' | 'processing_batch' | 
        'processing_url' | 'processing_complete' | 'linking_start' | 'linking_complete' | 'error' | 'info' | 'warning';
  message: string;
  data?: any;
  progress?: number; // 0-100
};

/**
 * Main controller for the Puppeteer-based workflow
 * This provides an alternative to the AI-based workflow that can handle JavaScript-rendered content
 * @param rootUrl The root URL to start scraping from
 * @param progressCallback Optional callback for real-time progress updates
 * @param aiApiKey Optional API key for AI-based linking (if null, will use heuristic linking)
 * @param linkingModel The AI model to use for linking (if aiApiKey is provided)
 * @returns The complete workflow with linked prerequisites
 */
export async function createPuppeteerWorkflow(
  rootUrl: string,
  progressCallback?: (update: ProcessingProgressUpdate) => void,
  aiApiKey?: string,
  linkingModel: string = 'openai'
) {
  // Create a wrapper around the callback to handle any potential issues
  const safeCallback = (update: ProcessingProgressUpdate) => {
    try {
      // Ensure the update has all required properties
      const validUpdate = {
        ...update,
        message: update.message || "No message provided",
        // Keep progress as undefined if not provided, don't use null
        progress: update.progress
      };
      
      // Call the original callback if provided
      if (progressCallback) {
        setTimeout(() => progressCallback(validUpdate), 0);
      }
    } catch (error) {
      console.error("Error in progress callback:", error);
    }
  };

  try {
    console.log(`Starting Puppeteer-based workflow for ${rootUrl}`);
    safeCallback({
      type: 'scraping_start',
      message: `Starting to scrape ${rootUrl}`,
      progress: 0
    });
    
    // Stage 1: Scrape the root page using Puppeteer
    console.log("Stage 1: Scraping with Puppeteer");
    const { apiEndpointUrls, subsectionUrls } = await scrapeRootPageWithPuppeteer(rootUrl);
    
    safeCallback({
      type: 'scraping_complete',
      message: `Scraping complete. Found ${apiEndpointUrls.length} direct API endpoints and ${subsectionUrls.length} subsections.`,
      data: { apiEndpointUrls, subsectionUrls },
      progress: 20
    });
    
    // If no direct API endpoints found, process subsections
    let allApiEndpoints = apiEndpointUrls;
    if (apiEndpointUrls.length === 0 && subsectionUrls.length > 0) {
      console.log("No direct API endpoints found, processing subsections");
      safeCallback({
        type: 'processing_start',
        message: "No direct API endpoints found, processing subsections",
        progress: 25
      });
      
      // Process each subsection to find API endpoints (limit to first 5 to avoid overwhelming)
      const subsectionsToProcess = subsectionUrls.slice(0, 5);
      
      // Process subsections one by one to provide updates
      const subsectionApiEndpoints = [];
      for (let i = 0; i < subsectionsToProcess.length; i++) {
        const subsectionUrl = subsectionsToProcess[i];
        
        safeCallback({
          type: 'processing_url',
          message: `Processing subsection ${i + 1}/${subsectionsToProcess.length}: ${subsectionUrl}`,
          data: { url: subsectionUrl },
          progress: 25 + Math.floor((i / subsectionsToProcess.length) * 15)
        });
        
        try {
          const result = await scrapeRootPageWithPuppeteer(subsectionUrl);
          subsectionApiEndpoints.push(...result.apiEndpointUrls);
        } catch (error) {
          console.error(`Error processing subsection ${subsectionUrl}:`, error);
          safeCallback({
            type: 'error',
            message: `Error processing subsection ${subsectionUrl}: ${error instanceof Error ? error.message : String(error)}`,
            data: { url: subsectionUrl, error }
          });
        }
      }
      
      allApiEndpoints = subsectionApiEndpoints;
    }
    
    // If no API endpoints found at all, return error
    if (allApiEndpoints.length === 0) {
      const errorMsg = "No API endpoints found";
      console.error(errorMsg);
      safeCallback({
        type: 'error',
        message: errorMsg,
        progress: 100
      });
      
      return {
        status: "error",
        error: errorMsg,
        rootUrl
      };
    }
    
    console.log(`Found ${allApiEndpoints.length} API endpoints to process`);
    safeCallback({
      type: 'processing_start',
      message: `Found ${allApiEndpoints.length} API endpoints to process`,
      data: { endpoints: allApiEndpoints },
      progress: 40
    });
    
    // Stage 2: Process API endpoints with Puppeteer with progress updates
    console.log("Stage 2: Processing API endpoints with Puppeteer");
    
    // Process API endpoints in batches to avoid overwhelming the system
    const batchSize = 3; // Smaller batch size for Puppeteer to manage resources
    const processedResults = [];
    
    for (let i = 0; i < allApiEndpoints.length; i += batchSize) {
      const batch = allApiEndpoints.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allApiEndpoints.length / batchSize);
      
      safeCallback({
        type: 'processing_batch',
        message: `Processing batch ${batchNumber} of ${totalBatches}`,
        data: { batchNumber, totalBatches, batch },
        progress: 40 + Math.floor((i / allApiEndpoints.length) * 30)
      });
      
      console.log(`Processing batch ${batchNumber} of ${totalBatches} with Puppeteer`);
      
      // Process endpoints sequentially within each batch to avoid browser instance conflicts
      for (const url of batch) {
        safeCallback({
          type: 'processing_url',
          message: `Processing ${url}`,
          data: { url },
        });
        
        console.log(`Processing ${url} with Puppeteer`);
        try {
          // Add a small delay between processing each URL to give time for the UI to update
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const result = await processApiEndpointWithPuppeteer(url);
          processedResults.push(result);
          
          // Send an update with the result and allow time for the update to be sent
          await new Promise(resolve => {
            safeCallback({
              type: 'processing_url',
              message: `Completed processing ${url}: ${result.status}`,
              data: { url, result },
            });
            setTimeout(resolve, 100);
          });
        } catch (error) {
          console.error(`Error processing ${url}:`, error);
          processedResults.push({
            url,
            status: "error",
            error: error instanceof Error ? error.message : "An error occurred"
          });
          
          safeCallback({
            type: 'error',
            message: `Error processing ${url}: ${error instanceof Error ? error.message : String(error)}`,
            data: { url, error }
          });
          
          // Small delay to ensure error message gets processed
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    // Count success, error, and skipped results
    const successCount = processedResults.filter(r => r.status === "success").length;
    const errorCount = processedResults.filter(r => r.status === "error").length;
    const skippedCount = processedResults.filter(r => r.status === "skipped").length;
    
    // Add a small delay before sending the next update to ensure previous updates were processed
    await new Promise(resolve => setTimeout(resolve, 200));
    
    safeCallback({
      type: 'processing_complete',
      message: `Processed ${processedResults.length} endpoints: ${successCount} success, ${errorCount} error, ${skippedCount} skipped`,
      data: { processedResults, successCount, errorCount, skippedCount },
      progress: 70
    });
    
    console.log(`Processed ${processedResults.length} endpoints: ${successCount} success, ${errorCount} error, ${skippedCount} skipped`);
    
    // Add a small delay before the next stage
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Stage 3: Link prerequisites using AI or heuristics
    console.log("Stage 3: Linking prerequisites");
    safeCallback({
      type: 'linking_start',
      message: "Linking prerequisites between endpoints",
      progress: 80
    });
    
    const linkedResults = await linkPrerequisites(processedResults, aiApiKey, linkingModel);
    
    // Add a small delay before sending the final update
    await new Promise(resolve => setTimeout(resolve, 200));
    
    safeCallback({
      type: 'linking_complete',
      message: "Linking complete",
      data: { linkedResults },
      progress: 100
    });
    
    // Format final results
    return {
      status: "success",
      rootUrl,
      results: linkedResults,
      stats: {
        totalEndpoints: allApiEndpoints.length,
        processedEndpoints: processedResults.length,
        successfulEndpoints: successCount,
        failedEndpoints: errorCount,
        skippedEndpoints: skippedCount
      }
    };
  } catch (error) {
    console.error("Error in Puppeteer workflow:", error);
    safeCallback({
      type: 'error',
      message: `Error in Puppeteer workflow: ${error instanceof Error ? error.message : String(error)}`,
      data: { error },
      progress: 100
    });
    
    return {
      status: "error",
      error: error instanceof Error ? error.message : "An unknown error occurred",
      rootUrl
    };
  }
} 