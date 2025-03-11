import React, { useState, useEffect } from "react";
import Head from "next/head";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Sparkles, Shield, Info, ChevronDown, Plus, X, Globe, List, Cpu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const [urls, setUrls] = useState("");
  const [rootUrl, setRootUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualPrerequisiteUrls, setManualPrerequisiteUrls] = useState<Record<string, string[]>>({});
  const [newPrereqUrl, setNewPrereqUrl] = useState("");
  const [activeUrlForPrereq, setActiveUrlForPrereq] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("multiple-urls");
  const [apiEndpoints, setApiEndpoints] = useState<string[]>([]);
  const [rootUrlProcessed, setRootUrlProcessed] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [additionalApiKey, setAdditionalApiKey] = useState("");

  useEffect(() => {
    // Load API key from localStorage on component mount
    const savedApiKey = localStorage.getItem("gemini-api-key");
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    
    // Load selected model from localStorage
    const savedModel = localStorage.getItem("selected-model");
    if (savedModel && (savedModel === "gemini" || savedModel === "openai")) {
      setSelectedModel(savedModel);
    }
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem("gemini-api-key", newKey);
  };

  const handleClearApiKey = () => {
    setApiKey("");
    localStorage.removeItem("gemini-api-key");
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    localStorage.setItem("selected-model", value);
  };

  const handleAddManualPrerequisite = (mainUrl: string) => {
    if (!newPrereqUrl.trim()) return;
    
    setManualPrerequisiteUrls(prev => {
      const updatedUrls = { ...prev };
      if (!updatedUrls[mainUrl]) {
        updatedUrls[mainUrl] = [];
      }
      updatedUrls[mainUrl] = [...updatedUrls[mainUrl], newPrereqUrl.trim()];
      return updatedUrls;
    });
    
    setNewPrereqUrl("");
  };

  const handleRemoveManualPrerequisite = (mainUrl: string, index: number) => {
    setManualPrerequisiteUrls(prev => {
      const updatedUrls = { ...prev };
      if (updatedUrls[mainUrl]) {
        updatedUrls[mainUrl] = updatedUrls[mainUrl].filter((_, i) => i !== index);
        if (updatedUrls[mainUrl].length === 0) {
          delete updatedUrls[mainUrl];
        }
      }
      return updatedUrls;
    });
  };

  const handleProcessManualPrerequisites = async (mainUrl: string) => {
    if (!manualPrerequisiteUrls[mainUrl] || manualPrerequisiteUrls[mainUrl].length === 0) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/process-manual-prerequisites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ 
          mainUrl,
          prerequisiteUrls: manualPrerequisiteUrls[mainUrl] 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process manual prerequisites");
      }

      // Update the results with the new prerequisite workflows
      setResults(prevResults => 
        prevResults.map(result => {
          if (result.url === mainUrl) {
            return {
              ...result,
              prerequisiteWorkflows: [
                ...(result.prerequisiteWorkflows || []),
                ...data.prerequisiteWorkflows
              ]
            };
          }
          return result;
        })
      );

      // Clear the manual prerequisites for this URL
      setManualPrerequisiteUrls(prev => {
        const updated = { ...prev };
        delete updated[mainUrl];
        return updated;
      });
      
      setActiveUrlForPrereq(null);
    } catch (err: any) {
      setError(err.message || "An error occurred while processing manual prerequisites");
    } finally {
      setLoading(false);
    }
  };

  const handleAdditionalApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setAdditionalApiKey(newKey);
    localStorage.setItem("additional-api-key", newKey);
  };

  const handleSubmitMultipleUrls = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setResults([]);
    setApiEndpoints([]);
    setRootUrlProcessed(null);

    if (!apiKey) {
      setError("Please enter your Gemini API key");
      setLoading(false);
      return;
    }

    try {
      // Split URLs by newline and commas, then flatten, trim, remove quotes and filter out empty lines
      const urlList = urls
        .split(/[\n,]/) // Split by newline or comma
        .map((url) => url.trim().replace(/['"]/g, "")) // Remove both single and double quotes
        .filter((url) => url);

      if (urlList.length === 0) {
        setError("Please enter at least one URL");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/process-urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ urls: urlList }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process URLs");
      }

      setResults(data.results);
    } catch (err: any) {
      setError(err.message || "An error occurred while processing URLs");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRootUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setResults([]);
    setApiEndpoints([]);
    setRootUrlProcessed(null);

    if (!apiKey) {
      setError("Please enter your Gemini API key");
      setLoading(false);
      return;
    }

    if (!rootUrl.trim()) {
      setError("Please enter a root URL");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/process-root-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ 
          rootUrl: rootUrl.trim(),
          model: selectedModel,
          additionalApiKey
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process root URL");
      }

      // Handle the response from process-root-url
      if (data.results) {
        setResults(data.results);
        setApiEndpoints(data.apiEndpoints || []);
      }

      // If the root URL was processed directly
      if (data.rootUrlProcessed) {
        setRootUrlProcessed(data.rootUrlProcessed);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while processing the root URL");
    } finally {
      setLoading(false);
    }
  };

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.5 },
  };

  return (
    <>
      <Head>
        <title>URL Processor</title>
        <meta
          name="description"
          content="Process multiple URLs and extract information"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/my_website_logo_MK.png" />
      </Head>
      <div className="bg-gradient-to-b from-background to-secondary/20 min-h-screen flex flex-col">
        <Header />
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex-1 container mx-auto py-12 px-4 max-w-4xl"
        >
          <Card className="w-full backdrop-blur-sm bg-background/95 shadow-lg border-primary/10">
            <CardHeader className="space-y-4">
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <CardTitle className="text-3xl font-bold flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-primary" />
                  URL Processor
                </CardTitle>
                <CardDescription className="text-lg mt-2">
                  Enter your Gemini API key and URLs to process and extract information
                </CardDescription>
                <Alert className="mt-4 bg-muted/50">
                  <Shield className="h-4 w-4" />
                  <AlertDescription className="ml-2 flex items-center gap-1">
                    Your API key is only stored in your browser&apos;s localStorage and is never sent to our servers. We only use it to make direct calls to Gemini.
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Your API key is only temporarily stored in your browser&apos;s localStorage for convenience. It&apos;s only used to make direct API calls to Gemini and is never transmitted to or stored on our servers.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </AlertDescription>
                </Alert>
              </motion.div>
            </CardHeader>
            <CardContent>
              <motion.div
                className="space-y-2 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <Select onValueChange={handleModelChange} defaultValue={selectedModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select AI Model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative flex items-center">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    placeholder="Enter your Gemini API key"
                    className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary pr-20 text-foreground"
                  />
                  {apiKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearApiKey}
                      className="absolute right-2 text-muted-foreground hover:text-primary"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </motion.div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid grid-cols-2 mb-6">
                  <TabsTrigger value="multiple-urls" className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Multiple URLs
                  </TabsTrigger>
                  <TabsTrigger value="root-url" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Root URL
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="multiple-urls">
                  <form onSubmit={handleSubmitMultipleUrls} className="space-y-6">
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Textarea
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                        placeholder="Enter URLs separated by newlines or commas (quotes will be automatically removed):&#10;https://example1.com&#10;'https://example2.com',\https://example3.com\"
                        className="min-h-[200px] transition-all duration-200 focus:shadow-lg"
                      />
                    </motion.div>

                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full text-lg py-6"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Process URLs"
                        )}
                      </Button>
                    </motion.div>
                  </form>
                </TabsContent>
                
                <TabsContent value="root-url">
                  <form onSubmit={handleSubmitRootUrl} className="space-y-6">
                    <motion.div
                      className="space-y-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Input
                        value={rootUrl}
                        onChange={(e) => setRootUrl(e.target.value)}
                        placeholder="Enter a root URL (e.g., https://example.com)"
                        className="transition-all duration-200 focus:shadow-lg"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        This will scan the root URL and automatically discover API documentation pages.
                      </p>
                    </motion.div>

                    <motion.div
                      className="relative flex items-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Input
                        value={additionalApiKey}
                        onChange={handleAdditionalApiKeyChange}
                        placeholder="Enter additional API key"
                        className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary pr-20 text-foreground"
                      />
                    </motion.div>

                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full text-lg py-6"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Process Root URL"
                        )}
                      </Button>
                    </motion.div>
                  </form>
                </TabsContent>
              </Tabs>

              <AnimatePresence>
                {error && (
                  <motion.div {...fadeInUp} className="mt-6">
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {/* Display API Endpoints found from root URL */}
                {apiEndpoints.length > 0 && (
                  <motion.div {...fadeInUp} className="mt-8 space-y-4">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                      <Globe className="w-5 h-5 text-primary" />
                      Discovered API Endpoints
                    </h2>
                    <Card className="p-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          Found {apiEndpoints.length} potential API documentation pages:
                        </p>
                        <div className="max-h-[200px] overflow-y-auto space-y-1 p-2 bg-muted/30 rounded-md">
                          {apiEndpoints.map((endpoint, idx) => (
                            <div key={idx} className="text-sm break-all p-1 hover:bg-muted/50 rounded">
                              {endpoint}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}

                {/* Display Root URL processed directly */}
                {rootUrlProcessed && (
                  <motion.div {...fadeInUp} className="mt-8 space-y-4">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                      <Globe className="w-5 h-5 text-primary" />
                      Root URL Processed
                    </h2>
                    <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
                      <h3 className="font-semibold mb-2 break-all">
                        {rootUrlProcessed.url}
                      </h3>
                      {rootUrlProcessed.status === "success" ? (
                        <div className="space-y-4">
                          <div className="bg-muted/50 p-4 rounded-lg">
                            {rootUrlProcessed.result ? (
                              <div className="space-y-3">
                                <h4 className="font-medium text-lg">{rootUrlProcessed.result.step_name}</h4>
                                
                                <div className="bg-background p-3 rounded">
                                  <pre className="font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(rootUrlProcessed.result, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            ) : (
                              <pre className="mt-2 p-3 bg-background rounded-md overflow-x-auto whitespace-pre-wrap">
                                {rootUrlProcessed.result}
                              </pre>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-destructive">{rootUrlProcessed.error}</p>
                      )}
                    </Card>
                  </motion.div>
                )}

                {/* Display results from processed URLs */}
                {results.length > 0 && (
                  <motion.div {...fadeInUp} className="mt-8 space-y-4">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Results
                    </h2>
                    {results.map((result, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
                          <h3 className="font-semibold mb-2 break-all">
                            {result.url}
                          </h3>
                          {result.status === "success" ? (
                            <div className="space-y-4">
                              <div className="bg-muted/50 p-4 rounded-lg">
                                {result.result ? (
                                  <div className="space-y-3">
                                    <h4 className="font-medium text-lg">{result.result.step_name}</h4>
                                    
                                    {/* Display entire parsedData in a single div */}
                                    <div className="bg-background p-3 rounded">
                                      <pre className="font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(result.result, null, 2)}
                                      </pre>
                                    </div>
                                    
                                    <Accordion type="single" collapsible className="w-full">
                                      <AccordionItem value="raw-json">
                                        <AccordionTrigger className="text-sm text-muted-foreground">
                                          Show Raw JSON
                                        </AccordionTrigger>
                                        <AccordionContent>
                                          <pre className="mt-2 p-3 bg-background rounded-md overflow-x-auto whitespace-pre-wrap text-xs">
                                            {result.result}
                                          </pre>
                                        </AccordionContent>
                                      </AccordionItem>
                                    </Accordion>
                                  </div>
                                ) : (
                                  <pre className="mt-2 p-3 bg-background rounded-md overflow-x-auto whitespace-pre-wrap">
                                    {result.result}
                                  </pre>
                                )}
                              </div>
                              
                              {/* Prerequisite workflows section */}
                              <div className="mt-4">
                                <Accordion type="single" collapsible className="w-full">
                                  <AccordionItem value="prerequisites">
                                    <AccordionTrigger className="py-2">
                                      <div className="flex items-center gap-2">
                                        <span>Prerequisite Workflows</span>
                                        <Badge variant="outline">
                                          {(result.prerequisiteWorkflows?.length || 0) + 
                                           (manualPrerequisiteUrls[result.url]?.length || 0)}
                                        </Badge>
                                      </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      {/* No prerequisites found message */}
                                      {(!result.prerequisiteWorkflows || result.prerequisiteWorkflows.length === 0) && (
                                        <Alert className="mb-4 bg-muted/50">
                                          <Info className="h-4 w-4" />
                                          <AlertTitle>No prerequisites automatically detected</AlertTitle>
                                          <AlertDescription className="mt-1">
                                            No prerequisite URLs were automatically detected. You can manually add them below.
                                          </AlertDescription>
                                        </Alert>
                                      )}
                                      
                                      {/* Manual prerequisite URL input */}
                                      <div className="mb-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                          <Button 
                                            type="button" 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => setActiveUrlForPrereq(activeUrlForPrereq === result.url ? null : result.url)}
                                          >
                                            {activeUrlForPrereq === result.url ? "Cancel" : "Add Prerequisite URLs"}
                                          </Button>
                                        </div>
                                        
                                        {activeUrlForPrereq === result.url && (
                                          <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-3 p-3 border rounded-md"
                                          >
                                            <div className="flex gap-2">
                                              <Input
                                                value={newPrereqUrl}
                                                onChange={(e) => setNewPrereqUrl(e.target.value)}
                                                placeholder="Enter prerequisite URL"
                                                className="flex-1"
                                              />
                                              <Button 
                                                type="button" 
                                                onClick={() => handleAddManualPrerequisite(result.url)}
                                                disabled={!newPrereqUrl.trim()}
                                              >
                                                <Plus className="h-4 w-4 mr-1" /> Add
                                              </Button>
                                            </div>
                                            
                                            {/* List of manually added prerequisite URLs */}
                                            {manualPrerequisiteUrls[result.url] && manualPrerequisiteUrls[result.url].length > 0 && (
                                              <div className="space-y-2 mt-2">
                                                <h4 className="text-sm font-medium">Added URLs:</h4>
                                                <div className="space-y-2">
                                                  {manualPrerequisiteUrls[result.url].map((url, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                                                      <span className="text-sm truncate flex-1">{url}</span>
                                                      <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => handleRemoveManualPrerequisite(result.url, idx)}
                                                      >
                                                        <X className="h-4 w-4" />
                                                      </Button>
                                                    </div>
                                                  ))}
                                                </div>
                                                <Button 
                                                  type="button" 
                                                  className="w-full mt-2"
                                                  onClick={() => handleProcessManualPrerequisites(result.url)}
                                                  disabled={loading}
                                                >
                                                  {loading ? (
                                                    <>
                                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                      Processing...
                                                    </>
                                                  ) : (
                                                    "Process Prerequisite URLs"
                                                  )}
                                                </Button>
                                              </div>
                                            )}
                                          </motion.div>
                                        )}
                                      </div>
                                      
                                      {/* Display existing prerequisite workflows */}
                                      {result.prerequisiteWorkflows && result.prerequisiteWorkflows.length > 0 && (
                                        <div className="pl-4 space-y-4 mt-2">
                                          {result.prerequisiteWorkflows.map((prereq: any, pIndex: number) => (
                                            <Card key={pIndex} className="p-3 border border-border/30">
                                              <h4 className="font-medium text-sm mb-2 break-all">
                                                {prereq.url}
                                              </h4>
                                              {prereq.status === "success" ? (
                                                <div className="bg-muted/30 p-3 rounded-md">
                                                  {prereq.parsedData ? (
                                                    <div className="text-xs">
                                                      <pre className="font-mono bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                                        {JSON.stringify(prereq.parsedData, null, 2)}
                                                      </pre>
                                                      <Accordion type="single" collapsible className="w-full mt-1">
                                                        <AccordionItem value="prereq-raw">
                                                          <AccordionTrigger className="text-xs py-1">
                                                            Show Raw Data
                                                          </AccordionTrigger>
                                                          <AccordionContent>
                                                            <pre className="text-xs mt-1 p-2 bg-background rounded overflow-x-auto whitespace-pre-wrap">
                                                              {prereq.result}
                                                            </pre>
                                                          </AccordionContent>
                                                        </AccordionItem>
                                                      </Accordion>
                                                    </div>
                                                  ) : (
                                                    <pre className="text-xs mt-1 p-2 bg-background rounded overflow-x-auto whitespace-pre-wrap">
                                                      {prereq.result}
                                                    </pre>
                                                  )}
                                                </div>
                                              ) : (
                                                <p className="text-destructive text-sm">{prereq.error}</p>
                                              )}
                                            </Card>
                                          ))}
                                        </div>
                                      )}
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              </div>
                            </div>
                          ) : (
                            <p className="text-destructive">{result.error}</p>
                          )}
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.main>
      </div>
    </>
  );
}
