import React from 'react';
import Head from 'next/head';
import { Container, Typography, Box, Divider } from '@mui/material';
import PuppeteerWorkflowStreamForm from '../components/PuppeteerWorkflowStreamForm';

/**
 * Page for the Puppeteer-based API workflow creator with real-time streaming updates
 */
const PuppeteerWorkflowStreamPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Puppeteer API Workflow Creator - Real-Time Updates</title>
        <meta name="description" content="Create API workflows using Puppeteer with real-time updates" />
      </Head>
      
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Puppeteer API Workflow Creator with Real-Time Updates
          </Typography>
          
          <Typography variant="subtitle1" align="center" color="text.secondary" sx={{ mb: 4 }}>
            See processing progress in real-time as your API workflow is created
          </Typography>
          
          <Divider sx={{ mb: 4 }} />
          
          <PuppeteerWorkflowStreamForm />
          
          <Box sx={{ mt: 6 }}>
            <Typography variant="h5" gutterBottom>
              How It Works
            </Typography>
            
            <Typography variant="body1" paragraph>
              This enhanced workflow creator uses Puppeteer to scrape and process API documentation, with the added benefit of real-time updates to show you what's happening at each step.
            </Typography>
            
            <Typography variant="body1" paragraph>
              The streaming workflow process follows these steps:
            </Typography>
            
            <ol>
              <li>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>Scraping:</strong> Puppeteer loads the provided URL, executes JavaScript, and captures the fully rendered content.
                </Typography>
              </li>
              <li>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>Processing:</strong> Each API endpoint is processed one by one, with real-time updates displayed in the UI.
                </Typography>
              </li>
              <li>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>Linking:</strong> Related API endpoints are linked together based on their prerequisites.
                </Typography>
              </li>
              <li>
                <Typography variant="body1">
                  <strong>Generation:</strong> A complete workflow is generated that can be imported into your application.
                </Typography>
              </li>
            </ol>
            
            <Typography variant="body1" paragraph sx={{ mt: 2 }}>
              The real-time updates make it easier to understand what's happening behind the scenes and identify any potential issues during processing.
            </Typography>
          </Box>
        </Box>
      </Container>
    </>
  );
};

export default PuppeteerWorkflowStreamPage; 