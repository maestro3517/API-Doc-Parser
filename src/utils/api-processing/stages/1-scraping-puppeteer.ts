import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

/**
 * Scrapes data from a URL using Puppeteer and returns the text content, HTML, and Cheerio instance
 * @param url The URL to scrape
 * @returns Object containing text content, HTML, and Cheerio instance
 */
export async function scrapeDataWithPuppeteer(url: string) {
  let browser;
  try {
    // Launch a headless browser
    browser = await puppeteer.launch({
      headless: true, // Use headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    // Open a new page
    const page = await browser.newPage();
    
    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to the page and wait until network is idle
    await page.goto(url, { 
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 30000
    });
    
    // Execute JavaScript to scroll down and reveal lazy-loaded content
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Get the HTML content
    const html = await page.content();
    
    // Load HTML into cheerio for consistent API with existing code
    const $ = cheerio.load(html);
    
    // Get text content
    const text = await page.evaluate(() => document.body.innerText);
    
    return {
      text,
      html,
      $,
    };
  } catch (error) {
    console.error(`Error scraping ${url} with Puppeteer:`, error);
    throw error;
  } finally {
    // Close the browser
    if (browser) {
      await browser.close();
    }
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
 * Main function for Puppeteer-based scraping of the root page
 * @param rootUrl The root URL to scrape
 * @returns Object containing API endpoint URLs and subsection URLs
 */
export async function scrapeRootPageWithPuppeteer(rootUrl: string) {
  try {
    const { text, $ } = await scrapeDataWithPuppeteer(rootUrl);
    
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
    console.error(`Error scraping root page ${rootUrl} with Puppeteer:`, error);
    throw error;
  }
}

/**
 * Extracts structured API information directly from a page using Puppeteer
 * Attempts to find API-related elements like code blocks, tables, and structured content
 * @param url The URL to analyze
 * @returns Structured API data (if found)
 */
export async function extractApiStructure(url: string) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract structured content that might contain API information
    const apiData = await page.evaluate(() => {
      const result: any = {
        title: document.title,
        url: window.location.href,
        apiEndpoints: [],
      };

      // Find potential API endpoint sections
      const sections = Array.from(document.querySelectorAll('section, div.endpoint, div.method, div.api, .api-section'));
      
      for (const section of sections) {
        // Try to extract API information from each potential section
        const heading = section.querySelector('h1, h2, h3, h4')?.textContent?.trim();
        if (!heading) continue;
        
        // Look for HTTP method indicators
        const methodMatch = heading.match(/(GET|POST|PUT|PATCH|DELETE)/i);
        const method = methodMatch ? methodMatch[1].toUpperCase() : null;
        
        // Look for URLs or endpoints in the section
        let endpoint = '';
        const codeBlock = section.querySelector('pre, code');
        if (codeBlock) {
          const urlMatch = codeBlock.textContent?.match(/(https?:\/\/[^\s"']+|\/[a-zA-Z0-9_\-\/]+)/);
          if (urlMatch) endpoint = urlMatch[1];
        }
        
        // Look for description
        const descriptionEl = section.querySelector('p');
        const description = descriptionEl ? descriptionEl.textContent?.trim() : '';
        
        // Look for parameters
        const parameters: any = {};
        const paramRows = Array.from(section.querySelectorAll('table tr'));
        for (const row of paramRows) {
          const cells = Array.from(row.querySelectorAll('td, th'));
          if (cells.length >= 2) {
            const paramName = cells[0].textContent?.trim();
            const paramDesc = cells[1].textContent?.trim();
            if (paramName && paramDesc) {
              parameters[paramName] = paramDesc;
            }
          }
        }
        
        // Add to API endpoints if we found meaningful information
        if (method || endpoint) {
          result.apiEndpoints.push({
            name: heading,
            method,
            endpoint,
            description,
            parameters
          });
        }
      }
      
      return result;
    });
    
    return apiData;
  } catch (error) {
    console.error(`Error extracting API structure from ${url}:`, error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
} 