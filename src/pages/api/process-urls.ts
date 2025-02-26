import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function scrapeData(url: string) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  return $('body').text();
}

async function sendToOpenAI(data: string) {
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
          },
          "required": [
              "organic_results"
          ]
      },
      "on_failure": "Log Error: Google Search Failed"
  }
  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: prompt + data },
    ],
  });

  console.log(response.choices[0].message.content);

  return response.choices[0].message.content;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Please provide a valid array of URLs' });
    }

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const data = await scrapeData(url);
          const result = await sendToOpenAI(data);
          return { url, result, status: 'success' };
        } catch (error) {
          console.error(`Error processing URL ${url}:`, error);
          return { url, error: 'Failed to process URL', status: 'error' };
        }
      })
    );

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Error in process-urls API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}