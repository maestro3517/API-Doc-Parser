import React, { useState, useEffect, useRef } from 'react';
import { 
  Button, TextField, Box, Typography, CircularProgress, Alert, Paper,
  List, ListItem, ListItemIcon, ListItemText, Divider, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { ProcessingProgressUpdate } from '../utils/api-processing/puppeteer-workflow';

// Icons for different types of updates - you might want to import actual icon components
const UpdateIcon = () => <span style={{ fontSize: '1.2rem' }}>📋</span>;
const ErrorIcon = () => <span style={{ fontSize: '1.2rem' }}>❌</span>;
const SuccessIcon = () => <span style={{ fontSize: '1.2rem' }}>✅</span>;
const WarningIcon = () => <span style={{ fontSize: '1.2rem' }}>⚠️</span>;
const InfoIcon = () => <span style={{ fontSize: '1.2rem' }}>ℹ️</span>;
const ExpandIcon = () => <span style={{ fontSize: '1.2rem' }}>▼</span>;

/**
 * Component for processing API documentation using Puppeteer-based workflow with real-time updates
 */
const PuppeteerWorkflowStreamForm: React.FC = () => {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  
  // State for streaming updates
  const [progress, setProgress] = useState<number>(0);
  const [updates, setUpdates] = useState<ProcessingProgressUpdate[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [reconnecting, setReconnecting] = useState(false);
  
  // Reference to the EventSource for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const taskUrlRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  
  // Reference to auto-scroll the updates list
  const updatesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto scroll to bottom when updates are added
  useEffect(() => {
    if (updatesEndRef.current) {
      updatesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updates]);
  
  // Cleanup the EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Opens an SSE connection to get updates
  const startSSEConnection = (targetUrl: string) => {
    // Save the task URL for potential reconnections
    taskUrlRef.current = targetUrl;
    
    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    // Reset retry count on fresh connection
    if (!reconnecting) {
      retryCountRef.current = 0;
    }
    
    // Create a new EventSource with the URL encoded as a query parameter
    const eventSource = new EventSource(`/api/process-with-puppeteer-stream?url=${encodeURIComponent(targetUrl)}`);
    eventSourceRef.current = eventSource;
    
    // Add an opened handler to reset reconnecting state
    eventSource.onopen = () => {
      if (reconnecting) {
        setReconnecting(false);
        setUpdates(prev => [...prev, {
          type: 'processing_start', // Changed from 'info' to valid type
          message: 'Reconnected to server successfully.',
          progress: progress
        }]);
      }
    };
    
    eventSource.onmessage = (event) => {
      try {
        // Reset retry count on successful message
        retryCountRef.current = 0;
        
        const update = JSON.parse(event.data) as ProcessingProgressUpdate;
        
        // Add the update to our list
        setUpdates(prev => [...prev, update]);
        
        // Update progress
        if (update.progress !== undefined) {
          setProgress(update.progress);
        }
        
        // Update current stage
        updateCurrentStage(update);
        
        // Handle completion
        if (update.type === 'processing_complete' && update.data) {
          setResult(update.data);
          setSuccess(true);
          setLoading(false);
          eventSource.close();
          taskUrlRef.current = null;
        }
        
        // Handle errors
        if (update.type === 'error') {
          setError(update.message);
          setLoading(false);
          eventSource.close();
          taskUrlRef.current = null;
        }
      } catch (err) {
        console.error('Error parsing update:', err, event.data);
      }
    };
    
    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      
      // If we're already loading and have a task URL, try to reconnect
      if (loading && taskUrlRef.current && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setReconnecting(true);
        
        setUpdates(prev => [...prev, {
          type: 'error',
          message: `Connection lost. Retrying (${retryCountRef.current}/${maxRetries})...`,
          progress: progress
        }]);
        
        // Try to reconnect after a delay
        eventSource.close();
        setTimeout(() => {
          if (taskUrlRef.current) {
            startSSEConnection(taskUrlRef.current);
          }
        }, 2000);
      } else if (retryCountRef.current >= maxRetries) {
        setError('Connection to server lost after multiple retries. Please try again.');
        setLoading(false);
        eventSource.close();
        taskUrlRef.current = null;
      }
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset states
    setError(null);
    setSuccess(false);
    setResult(null);
    setUpdates([]);
    setProgress(0);
    setCurrentStage('');
    setReconnecting(false);
    taskUrlRef.current = null;
    retryCountRef.current = 0;
    
    if (!url) {
      setError('URL is required');
      return;
    }
    
    try {
      setLoading(true);
      
      // Step 1: Make a POST request to start the processing
      const response = await fetch('/api/process-with-puppeteer-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          aiApiKey: apiKey || undefined,
          linkingModel: 'openai',
        }),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to start processing');
      }
      
      // Add a small delay to ensure the backend has time to set up the task
      setTimeout(() => {
        // The task has started, now connect via SSE to get updates
        startSSEConnection(url);
      }, 500);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setLoading(false);
    }
  };
  
  // Update the current stage based on the update type
  const updateCurrentStage = (update: ProcessingProgressUpdate) => {
    switch (update.type) {
      case 'scraping_start':
        setCurrentStage('Scraping API documentation');
        break;
      case 'scraping_complete':
        setCurrentStage('Scraping complete');
        break;
      case 'processing_start':
        setCurrentStage('Processing API endpoints');
        break;
      case 'processing_batch':
        setCurrentStage(`Processing batch ${update.data?.batchNumber || ''}/${update.data?.totalBatches || ''}`);
        break;
      case 'processing_complete':
        setCurrentStage('Processing complete');
        break;
      case 'linking_start':
        setCurrentStage('Linking prerequisites');
        break;
      case 'linking_complete':
        setCurrentStage('Workflow creation complete');
        setLoading(false);
        break;
      case 'error':
        setCurrentStage('Error occurred');
        setLoading(false);
        break;
    }
  };
  
  // Function to determine icon for update type
  const getUpdateIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <ErrorIcon />;
      case 'scraping_complete':
      case 'processing_complete':
      case 'linking_complete':
        return <SuccessIcon />;
      case 'processing_url':
        return <InfoIcon />;
      case 'info':
        return <InfoIcon />;
      case 'warning':
        return <WarningIcon />;
      default:
        return <UpdateIcon />;
    }
  };
  
  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 800, mx: 'auto', my: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Process API Documentation with Real-Time Updates
      </Typography>
      
      <Typography variant="body1" sx={{ mb: 3 }}>
        This tool uses Puppeteer to scrape and process JavaScript-rendered API documentation pages with real-time progress updates.
      </Typography>
      
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <TextField
          margin="normal"
          required
          fullWidth
          id="url"
          label="API Documentation URL"
          name="url"
          autoFocus
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          disabled={loading}
        />
        
        <TextField
          margin="normal"
          fullWidth
          id="apiKey"
          label="AI API Key (Optional)"
          name="apiKey"
          value={apiKey}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
          disabled={loading}
          helperText="Optional: Provide an OpenAI API key for more accurate prerequisite linking"
        />
        
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={loading}
        >
          {loading ? 
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CircularProgress size={24} sx={{ mr: 1 }} />
              {reconnecting ? 'Reconnecting...' : 'Processing...'}
            </Box> 
            : 'Process Documentation with Updates'
          }
        </Button>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      
      {loading && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Processing: {currentStage}
          </Typography>
          
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ height: 8, borderRadius: 2, my: 2 }}
          />
          
          <Typography variant="body2" align="right">
            {progress}% Complete
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle1" gutterBottom>
            Real-Time Updates:
          </Typography>
          
          <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 1, p: 1 }}>
            <List dense>
              {updates.map((update, index) => (
                <React.Fragment key={index}>
                  <ListItem alignItems="flex-start">
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      {getUpdateIcon(update.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={update.message}
                      secondary={
                        update.data && update.type !== 'error' ? (
                          <Accordion sx={{ mt: 1 }} disableGutters>
                            <AccordionSummary expandIcon={<ExpandIcon />}>
                              <Typography variant="caption">Details</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                                {JSON.stringify(update.data, null, 2)}
                              </Typography>
                            </AccordionDetails>
                          </Accordion>
                        ) : null
                      }
                    />
                  </ListItem>
                  {index < updates.length - 1 && <Divider component="li" />}
                </React.Fragment>
              ))}
              <div ref={updatesEndRef} />
            </List>
          </Box>
        </Box>
      )}
      
      {success && result && (
        <Box mt={3}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Processing completed successfully.
          </Alert>
          
          <Typography variant="h6" gutterBottom>
            Results Summary
          </Typography>
          
          <Typography variant="body2">
            <strong>Root URL:</strong> {result.rootUrl}
          </Typography>
          
          <Typography variant="body2">
            <strong>Status:</strong> {result.status}
          </Typography>
          
          {result.stats && (
            <>
              <Typography variant="body2">
                <strong>Total Endpoints:</strong> {result.stats.totalEndpoints}
              </Typography>
              <Typography variant="body2">
                <strong>Successful:</strong> {result.stats.successfulEndpoints}
              </Typography>
              <Typography variant="body2">
                <strong>Failed:</strong> {result.stats.failedEndpoints}
              </Typography>
              <Typography variant="body2">
                <strong>Skipped:</strong> {result.stats.skippedEndpoints}
              </Typography>
            </>
          )}
          
          <Button 
            variant="outlined" 
            sx={{ mt: 2 }}
            onClick={() => {
              // Download the result as JSON file
              const element = document.createElement("a");
              const file = new Blob([JSON.stringify(result, null, 2)], {
                type: "application/json",
              });
              element.href = URL.createObjectURL(file);
              element.download = "api-workflow.json";
              document.body.appendChild(element);
              element.click();
              document.body.removeChild(element);
            }}
          >
            Download Results
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default PuppeteerWorkflowStreamForm; 