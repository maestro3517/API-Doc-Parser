import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import {
  getPrompt,
  sendToGemini,
  parseAiResponse,
  ProcessedApiData,
} from "@/util/ai";

async function scrapeData(url: string) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  return $("body").text();
}

// Function to find URLs related to prerequisites in the scraped content
async function findPrerequisiteUrls(
  url: string,
  scrapedData: string,
  prerequisites: Record<string, string>
): Promise<string[]> {
  try {
    const relatedUrls: string[] = [];

    // If no prerequisites, return empty array
    if (!prerequisites || Object.keys(prerequisites).length === 0) {
      return relatedUrls;
    }

    // Get the base URL for resolving relative links
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Parse the HTML to find links
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // For each prerequisite, look for links that contain keywords from the prerequisite text
    Object.entries(prerequisites).forEach(([key, value]) => {
      // Extract keywords from prerequisite description
      const keywords = value
        .toLowerCase()
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 4 &&
            ![
              "must",
              "have",
              "need",
              "required",
              "should",
              "with",
              "your",
            ].includes(word)
        );

      // Find links containing these keywords
      $("a").each((_, element) => {
        const linkText = $(element).text().toLowerCase();
        const href = $(element).attr("href");

        if (href && !relatedUrls.includes(href)) {
          // Check if link text contains any keywords
          const containsKeyword = keywords.some((keyword) =>
            linkText.includes(keyword)
          );

          if (containsKeyword) {
            // Resolve relative URLs to absolute URLs
            const fullUrl = href.startsWith("http")
              ? href
              : new URL(href, baseUrl).toString();
            relatedUrls.push(fullUrl);
          }
        }
      });
    });

    return relatedUrls;
  } catch (error) {
    console.error("Error finding prerequisite URLs:", error);
    return [];
  }
}

// Process a single URL and return workflow data
async function processUrl(url: string, apiKey: string) {
  try {
    const scrapedData = await scrapeData(url);
    const result = await sendToGemini(scrapedData, apiKey);

    // Parse the AI response to extract structured data
    const parsedData = parseAiResponse(result) as ProcessedApiData;

    return {
      url,
      status: "success",
      result,
      parsedData,
      prerequisiteUrls: [],
    };
  } catch (error) {
    return {
      url,
      status: "error",
      error: error instanceof Error ? error.message : "An error occurred",
    };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid API key" });
  }
  const apiKey = authHeader.split(" ")[1];

  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const results = await Promise.all(
      urls.map(async (url: string) => {
        try {
          // Process original URL
          const scrapedData = await scrapeData(url);
          const result = await sendToGemini(scrapedData, apiKey);

          // Parse the AI response to extract structured data
          const parsedData = parseAiResponse(result) as ProcessedApiData;

          // Find URLs related to prerequisites
          const prerequisiteUrls = await findPrerequisiteUrls(
            url,
            scrapedData,
            parsedData.prerequisites
          );

          // Process prerequisite URLs
          const prerequisiteWorkflows = await Promise.all(
            prerequisiteUrls.map(async (prereqUrl) => {
              try {
                // Process each prerequisite URL
                const prereqData = await scrapeData(prereqUrl);
                const prereqResult = await sendToGemini(prereqData, apiKey);
                const prereqParsedData = parseAiResponse(prereqResult) as ProcessedApiData;
                
                return {
                  url: prereqUrl,
                  status: "success",
                  result: prereqResult,
                  parsedData: prereqParsedData
                };
              } catch (error) {
                return {
                  url: prereqUrl,
                  status: "error",
                  error: error instanceof Error ? error.message : "An error occurred",
                };
              }
            })
          );

          return {
            url,
            status: "success",
            result,
            parsedData,
            prerequisiteUrls,
            prerequisiteWorkflows
          };
        } catch (error) {
          return {
            url,
            status: "error",
            error: error instanceof Error ? error.message : "An error occurred",
          };
        }
      })
    );

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "An error occurred",
    });
  }
}
