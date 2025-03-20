import React, { useState } from 'react';
import Head from 'next/head';
import Header from "@/components/Header";
import PuppeteerWorkflowStreamForm from '../components/PuppeteerWorkflowStreamForm';
import { Code, Brain, Link, Sparkles, Copy, Check } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface WorkflowResult {
  id: string;
  step_name: string;
  action: string;
  inputs: Record<string, any>;
  prerequisites: Record<string, string>;
  api_config: {
    url: string;
    method: string;
    passInputsAsQuery: boolean;
    auth?: {
      type: string;
      key: string;
      paramName: string;
    };
    baseHeaders: Record<string, string>;
    rateLimit: {
      requestsPerMinute: number | null;
    };
  };
  response_schema: {
    type: string;
    properties: Record<string, any>;
  };
}

interface ApiResult {
  url: string;
  status: "success" | "error" | "skipped";
  result?: WorkflowResult | WorkflowResult[];
  multipleApis?: boolean;
  error?: string;
}

/**
 * Page for the Puppeteer-based API workflow creator with real-time streaming updates
 */
const PuppeteerWorkflowStreamPage: React.FC = () => {
  const [workflowResults, setWorkflowResults] = useState<ApiResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyWorkflow = async (workflow: WorkflowResult) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(workflow, null, 2));
      setCopiedId(workflow.id);
      toast.success("Workflow copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toast.error("Failed to copy workflow");
    }
  };

  const steps = [
    {
      icon: <Code className="w-6 h-6" />,
      title: "Scraping",
      description: "Puppeteer loads the provided URL, executes JavaScript, and captures the fully rendered content."
    },
    {
      icon: <Brain className="w-6 h-6" />,
      title: "Processing",
      description: "Each API endpoint is processed one by one, with real-time updates displayed in the UI."
    },
    {
      icon: <Link className="w-6 h-6" />,
      title: "Linking",
      description: "Related API endpoints are linked together based on their prerequisites."
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Generation",
      description: "A complete workflow is generated that can be imported into your application."
    }
  ];

  const renderWorkflowResults = (result: ApiResult) => {
    if (result.status === "error") {
      return (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-destructive">{result.error}</p>
          </CardContent>
        </Card>
      );
    }

    if (result.status === "skipped") {
      return (
        <Card className="border-muted bg-muted/10">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Skipped: {result.error}</p>
          </CardContent>
        </Card>
      );
    }

    if (!result.result) return null;

    const workflows = Array.isArray(result.result) ? result.result : [result.result];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-sm">
            {result.url}
          </Badge>
          {result.multipleApis && (
            <Badge variant="secondary" className="text-sm">
              Multiple APIs
            </Badge>
          )}
        </div>

        <Accordion type="single" collapsible className="w-full">
          {workflows.map((workflow) => (
            <AccordionItem value={workflow.id} key={workflow.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-4">
                  <span className="font-semibold">{workflow.step_name}</span>
                  <Badge variant="outline" className="text-xs">
                    {workflow.api_config.method}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {workflow.action}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyWorkflow(workflow)}
                      className="gap-2"
                    >
                      {copiedId === workflow.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Workflow
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Endpoint:</p>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {workflow.api_config.url}
                    </code>
                  </div>
                  {Object.keys(workflow.prerequisites).length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Prerequisites:</p>
                      <ul className="list-disc list-inside">
                        {Object.entries(workflow.prerequisites).map(([key, value]) => (
                          <li key={key}>{value}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>API Workflow Creator - Real-Time Processing</title>
        <meta name="description" content="Create API workflows using Puppeteer with real-time updates" />
      </Head>
      
      <div className="min-h-screen bg-background">
        <Header />
        
        <div className="container mx-auto px-4 py-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mb-3 bg-gradient-to-r from-primary to-indigo-500 text-transparent bg-clip-text">
              API Workflow Creator
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Transform API documentation into actionable workflows with real-time processing updates
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-12"
          >
            <Card className="border border-border bg-card/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                <PuppeteerWorkflowStreamForm onResult={setWorkflowResults} />
              </CardContent>
            </Card>
          </motion.div>

          {workflowResults && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-12"
            >
              <Card className="border border-border bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Generated Workflows</CardTitle>
                  <CardDescription>
                    The following workflows have been generated from the API documentation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renderWorkflowResults(workflowResults)}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12"
          >
            <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight text-center mb-8">
              How It Works
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((step, index) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  key={step.title}
                >
                  <Card className="h-full transition-all hover:shadow-lg hover:-translate-y-1 border border-border bg-card/50 backdrop-blur-sm">
                    <CardHeader className="text-center">
                      <div className="mx-auto rounded-full w-12 h-12 flex items-center justify-center bg-gradient-to-r from-primary to-indigo-500 mb-4">
                        {step.icon}
                      </div>
                      <CardTitle>{step.title}</CardTitle>
                      <CardDescription className="mt-2">{step.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PuppeteerWorkflowStreamPage; 