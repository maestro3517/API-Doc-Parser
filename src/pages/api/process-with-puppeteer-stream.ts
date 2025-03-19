import { NextApiRequest, NextApiResponse } from "next";
import { createPuppeteerWorkflow, ProcessingProgressUpdate } from "../../utils/api-processing/puppeteer-workflow";

// Extend the NextApiResponse type to include flush
interface StreamResponse extends NextApiResponse {
  flush?: () => void;
}

// We need to store active processing tasks to connect to them via SSE
interface ProcessingTask {
  sendUpdate: (update: ProcessingProgressUpdate) => void;
  updates: ProcessingProgressUpdate[];
  completed: boolean;
  result: any;
  error?: string;
  lastUpdateTime?: number; // Track when the last update was sent
}

// Store active processing tasks by URL (as a simple in-memory store)
const activeTasks = new Map<string, ProcessingTask>();

// Helper function to send data through SSE with proper flush
const sendSSEData = (res: StreamResponse, data: any) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (res.flush) res.flush();
};

// Helper function to send a comment (e.g., heartbeat)
const sendSSEComment = (res: StreamResponse, comment: string) => {
  res.write(`:${comment}\n\n`);
  if (res.flush) res.flush();
};

/**
 * API route handler for processing API documentation using Puppeteer with streaming updates
 * This endpoint handles both:
 * - POST: to start a new processing task
 * - GET: to establish an SSE connection to stream updates
 * 
 * @param req Request containing:
 *        - url: The URL to process
 *        - aiApiKey: (Optional) API key for AI-based linking 
 *        - linkingModel: (Optional) AI model for linking ('openai' or 'gemini')
 * @param res Response with streaming updates
 */
export default async function handler(req: NextApiRequest, res: StreamResponse) {
  // Handle GET for SSE connection
  if (req.method === "GET") {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL parameter is required" });
    }
    
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx
    
    // Check if we have an active task for this URL
    const task = activeTasks.get(url);
    
    if (!task) {
      // If no task exists, send an error and close the connection
      sendSSEData(res, {
        type: 'error',
        message: 'No processing task found for this URL. Please start a new task.',
        progress: 100
      });
      return res.end();
    }
    
    // Update the task's last update time
    task.lastUpdateTime = Date.now();
    
    // Send an initial keep-alive message to ensure the connection is established
    sendSSEComment(res, 'keepalive');
    
    // Send a welcome message to confirm the connection is working
    sendSSEData(res, {
      type: 'info',
      message: 'SSE connection established successfully. You will receive updates shortly.',
      progress: task.updates.length > 0 ? task.updates[task.updates.length - 1].progress : 0
    });
    
    // Send all existing updates to catch the client up
    task.updates.forEach(update => {
      sendSSEData(res, update);
    });
    
    // If the task is already completed, send the final result and close
    if (task.completed) {
      if (task.error) {
        sendSSEData(res, {
          type: 'error',
          message: task.error,
          progress: 100
        });
      } else {
        sendSSEData(res, {
          type: 'processing_complete',
          message: 'Processing completed',
          data: task.result,
          progress: 100
        });
      }
      return res.end();
    }
    
    // Override the task's sendUpdate function to also write to this response
    const originalSendUpdate = task.sendUpdate;
    task.sendUpdate = (update: ProcessingProgressUpdate) => {
      // Update the last update time
      task.lastUpdateTime = Date.now();
      
      // Call original first to ensure updates are stored
      originalSendUpdate(update);
      
      // Then send to this client if the response is still writable
      if (!res.writableEnded) {
        sendSSEData(res, update);
        
        // If this is a completion or error message, end the response
        if (update.type === 'processing_complete' || update.type === 'error') {
          res.end();
        }
      }
    };
    
    // Handle client disconnect
    req.on('close', () => {
      // Restore original sendUpdate when client disconnects
      if (!task.completed) {
        task.sendUpdate = originalSendUpdate;
      }
      console.log('Client disconnected from SSE');
    });
    
    // Send a heartbeat every 10 seconds to keep the connection alive
    // This is more frequent than the previous 30 seconds
    const heartbeatInterval = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeatInterval);
        return;
      }
      
      try {
        sendSSEComment(res, 'heartbeat');
        
        // If no updates have been sent in the last 40 seconds, send a status update
        // This helps ensure the client knows the connection is still alive
        const currentTime = Date.now();
        if (task.lastUpdateTime && (currentTime - task.lastUpdateTime) > 40000) {
          sendSSEData(res, {
            type: 'info',
            message: 'Still processing. No new updates in the last 40 seconds.',
            progress: task.updates.length > 0 ? 
              task.updates[task.updates.length - 1].progress : 0
          });
          task.lastUpdateTime = currentTime;
        }
      } catch (error) {
        console.error('Error sending heartbeat:', error);
        clearInterval(heartbeatInterval);
      }
    }, 10000);
    
    // Clear interval when client disconnects
    req.on('close', () => clearInterval(heartbeatInterval));
    
    return; // Keep the connection open
  }
  
  // Handle POST to start a new processing task
  if (req.method === "POST") {
    const { url, aiApiKey, linkingModel = 'openai' } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({ error: "Invalid URL format" });
    }
    
    // Check if a task already exists for this URL
    if (activeTasks.has(url)) {
      // If it's completed, clean it up and allow a new task
      const existingTask = activeTasks.get(url)!;
      if (!existingTask.completed) {
        return res.status(409).json({ 
          error: "A processing task for this URL is already in progress",
          taskId: url
        });
      }
      
      // Clean up completed task
      activeTasks.delete(url);
    }
    
    // Create a new task
    const updates: ProcessingProgressUpdate[] = [];
    let taskResult: any = null;
    let taskError: string | undefined;
    
    const task: ProcessingTask = {
      updates,
      completed: false,
      result: null,
      lastUpdateTime: Date.now(),
      sendUpdate: (update: ProcessingProgressUpdate) => {
        // Store the update time
        task.lastUpdateTime = Date.now();
        
        // Store the update
        updates.push(update);
        
        // If this is a completion or error message, mark the task as completed
        if (update.type === 'processing_complete') {
          task.completed = true;
          task.result = update.data;
        } else if (update.type === 'error') {
          task.completed = true;
          task.error = update.message;
        }
        
        // Log updates for debugging
        console.log(`Update for ${url}: ${update.type} - ${update.message} (${update.progress}%)`);
      }
    };
    
    // Store the task
    activeTasks.set(url, task);
    
    // Initial update
    task.sendUpdate({
      type: 'scraping_start',
      message: 'Processing task started. Connect with GET request to receive updates.',
      progress: 0
    });
    
    // Return success to the client to indicate the task has started
    const responseJson = { 
      message: "Processing started successfully",
      taskId: url
    };
    
    res.status(200).json(responseJson);
    
    // Start the processing in the background after the response is sent
    // Using setImmediate ensures the response is sent before processing starts
    setImmediate(async () => {
      try {
        console.log(`Starting Puppeteer workflow for ${url}`);
        const result = await createPuppeteerWorkflow(url, task.sendUpdate, aiApiKey, linkingModel);
        
        // Ensure a final update is sent if the task completed successfully
        // but somehow didn't get marked as completed
        if (!task.completed) {
          task.sendUpdate({
            type: 'processing_complete',
            message: 'Processing completed',
            data: result,
            progress: 100
          });
        }
        
        // Clean up old tasks after 30 minutes
        setTimeout(() => {
          console.log(`Cleaning up completed task for ${url}`);
          activeTasks.delete(url);
        }, 30 * 60 * 1000);
      } catch (error) {
        console.error("Error in Puppeteer workflow:", error);
        task.sendUpdate({
          type: 'error',
          message: `Error in Puppeteer workflow: ${error instanceof Error ? error.message : String(error)}`,
          data: { error },
          progress: 100
        });
        
        // Clean up after error
        setTimeout(() => {
          console.log(`Cleaning up failed task for ${url}`);
          activeTasks.delete(url);
        }, 5 * 60 * 1000);
      }
    });
    
    return;
  }
  
  // Any other HTTP method is not allowed
  return res.status(405).json({ error: "Method not allowed" });
}

// Configure the API route to disable the default body parser
export const config = {
  api: {
    bodyParser: true, // We still need to parse the initial request body
  },
}; 