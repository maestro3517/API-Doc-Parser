import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

async function scrapeData(url: string) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  return $('body').text();
}

async function sendToOpenAI(data: string, apiKey: string) {
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  const prompt = `
  This data is from an API doc website. We want to convert this data in this format:
  {
      "step_name": "Search Google for Keyword",
      "action": "get_google_serp",
      "inputs": {
          "language_code": "en",
          "location_code": 2840,
          "q": "{input.keyword}"
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

  Analyze this data and convert it to that format: ${data}`;

  const completion = await openai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-3.5-turbo",
  });

  return completion.choices[0].message.content;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  const apiKey = authHeader.split(' ')[1];

  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const results = await Promise.all(
      urls.map(async (url: string) => {
        try {
          const scrapedData = await scrapeData(url);
          const result = await sendToOpenAI(scrapedData, apiKey);
          return {
            url,
            status: 'success',
            result,
          };
        } catch (error) {
          return {
            url,
            status: 'error',
            error: error instanceof Error ? error.message : 'An error occurred',
          };
        }
      })
    );

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An error occurred' });
  }
}