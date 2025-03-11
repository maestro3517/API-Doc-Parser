# 🚀 URL Processor

A powerful, privacy-focused web application for processing multiple URLs using AI technology. Built with Next.js, TypeScript, and Tailwind CSS.

## ✨ Key Features

- 🔒 **Privacy-First**: Your OpenAI API key is stored only in your browser's localStorage
- ⚡ **Efficient Processing**: Handle multiple URLs simultaneously
- 🎨 **Modern UI**: Beautiful, responsive interface with smooth animations
- 🌙 **Accessibility**: Built with modern web standards and best practices
- 🛠️ **Developer Friendly**: Built with TypeScript for better development experience

## 🔧 Tech Stack

- **Frontend**: Next.js with TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Customized shadcn/ui components
- **Animations**: Framer Motion
- **Icons**: Lucide Icons

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run the development server:
   ```bash
   pnpm dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser

## 🔑 API Key Security

This application prioritizes user privacy and security:
- API keys are stored only in the client's browser localStorage
- Keys are never transmitted to our servers
- Direct communication between client and OpenAI API

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Open issues for bugs or enhancements
- Submit pull requests
- Improve documentation

## 📄 License

This project is open source and available under the MIT License.

---

Built with ❤️ using modern web technologies

# Workflow Creator API

This project provides API endpoints for extracting API documentation from websites and converting them into structured workflow actions.

## API Endpoints

### 1. Process URLs (`/api/process-urls`)

Process one or more specific API documentation URLs.

**Request:**
```http
POST /api/process-urls
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "urls": [
    "https://example.com/api/docs",
    "https://another-example.com/api/reference"
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "url": "https://example.com/api/docs",
      "status": "success",
      "result": "...",
      "parsedData": {
        "step_name": "Example API Action",
        "action": "example_action",
        "inputs": { ... },
        "prerequisites": { ... },
        "api_config": { ... },
        "response_schema": { ... }
      },
      "prerequisiteUrls": [ ... ],
      "prerequisiteWorkflows": [ ... ]
    }
  ]
}
```

### 2. Process Root URL (`/api/process-root-url`)

Process a root URL, automatically discover API documentation pages, and extract structured workflow actions from each.

**Request:**
```http
POST /api/process-root-url
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "rootUrl": "https://example.com"
}
```

**Response:**
```json
{
  "rootUrl": "https://example.com",
  "apiEndpoints": [
    "https://example.com/api/docs",
    "https://example.com/api/reference"
  ],
  "results": [
    {
      "url": "https://example.com/api/docs",
      "status": "success",
      "result": {
        "step_name": "Example API Action",
        "action": "example_action",
        "inputs": { ... },
        "prerequisites": { ... },
        "api_config": { ... },
        "response_schema": { ... }
      }
    },
    {
      "url": "https://example.com/api/reference",
      "status": "success",
      "result": { ... }
    }
  ],
  "successCount": 2,
  "totalScanned": 2
}
```

## How It Works

1. **Root URL Processing:**
   - The system scrapes the provided root URL
   - It extracts links that might point to API documentation
   - Each potential API documentation URL is processed

2. **API Documentation Detection:**
   - The system uses keyword analysis to identify API documentation
   - Pages with sufficient API-related keywords are processed

3. **Data Extraction:**
   - API documentation is sent to an AI model (Gemini)
   - The AI extracts structured information about the API
   - Results are returned as workflow actions

## Requirements

- Node.js
- Google Gemini API key (for AI processing)

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env.local` file with your API keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   ```

3. Run the development server:
   ```
   npm run dev
   ```

4. Access the API at `http://localhost:3000/api/`
