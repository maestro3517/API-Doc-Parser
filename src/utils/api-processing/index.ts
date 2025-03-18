import { scrapeRootPage } from './stages/1-scraping';
import { processApiEndpoints, ApiResult } from './stages/2-processing';
import { linkPrerequisites } from './stages/3-linking';

/**
 * Main function to process a root URL and extract API data
 * @param rootUrl The root URL to process
 * @param apiKey The API key for the AI model
 * @param model The AI model to use
 * @returns Object containing the processed API data
 */
export async function processRootUrl(
  rootUrl: string,
  apiKey: string,
  model: string = 'openai'
) {
  try {
    // Stage 1: Scrape the root page
    console.log(`Stage 1: Scraping root page ${rootUrl}`);
    const { apiEndpointUrls, subsectionUrls, rootContent } = await scrapeRootPage(rootUrl);
    
    // If no API endpoints found directly, process subsections
    let allApiEndpointUrls = [...apiEndpointUrls];
    if (apiEndpointUrls.length === 0 && subsectionUrls.length > 0) {
      console.log(`No API endpoints found directly. Processing ${subsectionUrls.length} subsections...`);
      
      // Process subsections in batches to avoid overwhelming the server
      const batchSize = 5;
      for (let i = 0; i < subsectionUrls.length; i += batchSize) {
        const batch = subsectionUrls.slice(i, i + batchSize);
        console.log(`Processing subsection batch ${i / batchSize + 1} of ${Math.ceil(subsectionUrls.length / batchSize)}`);
        
        const subsectionResults = await Promise.all(
          batch.map(url => scrapeRootPage(url))
        );
        
        // Collect API endpoints from subsections
        for (const result of subsectionResults) {
          allApiEndpointUrls.push(...result.apiEndpointUrls);
        }
      }
    }
    
    // Remove duplicates
    allApiEndpointUrls = Array.from(new Set(allApiEndpointUrls));
    console.log(`Found ${allApiEndpointUrls.length} total API endpoints`);
    
    if (allApiEndpointUrls.length === 0) {
      return {
        rootUrl,
        apiEndpoints: [],
        model,
        results: [],
        successCount: 0,
        totalScanned: 0,
        error: "No API documentation found"
      };
    }
    
    // Stage 2: Process API endpoints
    console.log(`Stage 2: Processing ${allApiEndpointUrls.length} API endpoints`);
    const results = await processApiEndpoints(allApiEndpointUrls, apiKey, model);
    
    // Count successful results
    const successfulResults = results.filter(result => result.status === "success");
    console.log(`Successfully processed ${successfulResults.length} API endpoints`);
    
    if (successfulResults.length === 0) {
      return {
        rootUrl,
        apiEndpoints: allApiEndpointUrls,
        model,
        results,
        successCount: 0,
        totalScanned: allApiEndpointUrls.length,
        error: "No valid API documentation found in any of the linked pages"
      };
    }
    
    // Stage 3: Link prerequisites
    console.log(`Stage 3: Linking prerequisites between ${successfulResults.length} API endpoints`);
    const linkedResults = await linkPrerequisites(results, apiKey, model);
    
    // Return the final results
    return {
      rootUrl,
      apiEndpoints: allApiEndpointUrls,
      model,
      results: linkedResults,
      successCount: successfulResults.length,
      totalScanned: allApiEndpointUrls.length
    };
  } catch (error) {
    console.error("Error processing root URL:", error);
    return {
      rootUrl,
      apiEndpoints: [],
      model,
      results: [],
      successCount: 0,
      totalScanned: 0,
      error: error instanceof Error ? error.message : "An error occurred"
    };
  }
}

// Export types and functions from stages
export * from './stages/1-scraping';
export * from './stages/2-processing';
export * from './stages/3-linking'; 