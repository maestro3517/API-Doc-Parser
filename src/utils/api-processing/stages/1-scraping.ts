import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Scrapes data from a URL and returns the text content, HTML, and Cheerio instance
 * @param url The URL to scrape
 * @returns Object containing text content, HTML, and Cheerio instance
 */
export async function scrapeData(url: string) {
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

/**
 * Checks if the scraped content contains API documentation
 * @param scrapedData The text content scraped from the page
 * @returns Boolean indicating if the content is API documentation
 */
export function isApiDocumentation(scrapedData: string): boolean {
  // Keywords that indicate API documentation
  const apiKeywords = [
    "api", "endpoint", "request", "response", "method", "parameter",
    "header", "status code", "authentication", "authorization",
    "GET", "POST", "PUT", "DELETE", "PATCH", "REST", "JSON"
  ];
  
  // Count how many API keywords are present in the content
  const keywordCount = apiKeywords.reduce((count, keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    return count + (regex.test(scrapedData) ? 1 : 0);
  }, 0);
  
  // If more than 3 API keywords are present, it's likely API documentation
  return keywordCount >= 3;
}

/**
 * Extracts API endpoint URLs from a page
 * @param baseUrl The base URL of the page
 * @param $ Cheerio instance loaded with the page HTML
 * @returns Array of API endpoint URLs
 */
export function extractApiEndpointUrls(baseUrl: string, $: ReturnType<typeof cheerio.load>): string[] {
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

  console.log(`Found ${apiEndpointUrls.size} API endpoints`);

  return Array.from(apiEndpointUrls);
}

/**
 * Scrapes subsections of a page to find API documentation
 * @param baseUrl The base URL of the page
 * @param $ Cheerio instance loaded with the page HTML
 * @returns Array of subsection URLs that might contain API documentation
 */
export function extractSubsectionUrls(baseUrl: string, $: ReturnType<typeof cheerio.load>): string[] {
  const subsectionUrls: Set<string> = new Set();
  const urlObj = new URL(baseUrl);
  const domain = `${urlObj.protocol}//${urlObj.host}`;
  
  // Look for links that might be subsections
  $("a").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    
    // Skip external links, anchors, and javascript links
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      return;
    }
    
    // Skip links that are likely not subsections
    if (href.includes("login") || href.includes("signup") || href.includes("contact")) {
      return;
    }
    
    // Convert relative URLs to absolute
    const fullUrl = href.startsWith("http") ? href : new URL(href, domain).toString();
    
    // Only include URLs from the same domain
    if (fullUrl.startsWith(domain)) {
      subsectionUrls.add(fullUrl);
    }
  });
  
  console.log(`Found ${subsectionUrls.size} subsection URLs`);
  
  return Array.from(subsectionUrls);
}

/**
 * Main function for stage 1: Scraping the root page
 * @param rootUrl The root URL to scrape
 * @returns Object containing API endpoint URLs and subsection URLs
 */
export async function scrapeRootPage(rootUrl: string) {
  try {
    const { text, $ } = await scrapeData(rootUrl);
    
    // First, try to find direct API endpoint URLs
    const apiEndpointUrls = extractApiEndpointUrls(rootUrl, $);
    
    // If no API endpoints found, extract subsection URLs to go one level deeper
    const subsectionUrls = apiEndpointUrls.length === 0 ? extractSubsectionUrls(rootUrl, $) : [];
    
    return {
      apiEndpointUrls,
      subsectionUrls,
      rootContent: text
    };
  } catch (error) {
    console.error(`Error scraping root page ${rootUrl}:`, error);
    throw error;
  }
} 