import React, { useState, useEffect } from "react";
import Head from "next/head";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Sparkles, Shield, Info, ChevronDown } from "lucide-react";
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

export default function Home() {
  const [urls, setUrls] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Load API key from localStorage on component mount
    const savedApiKey = localStorage.getItem("openai-api-key");
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem("openai-api-key", newKey);
  };

  const handleClearApiKey = () => {
    setApiKey("");
    localStorage.removeItem("openai-api-key");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!apiKey) {
      setError("Please enter your OpenAI API key");
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
                  Enter your OpenAI API key and URLs to process and extract information
                </CardDescription>
                <Alert className="mt-4 bg-muted/50">
                  <Shield className="h-4 w-4" />
                  <AlertDescription className="ml-2 flex items-center gap-1">
                    Your API key is only stored in your browser&apos;s localStorage and is never sent to our servers. We only use it to make direct calls to OpenAI.
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Your API key is only temporarily stored in your browser&apos;s localStorage for convenience. It&apos;s only used to make direct API calls to OpenAI and is never transmitted to or stored on our servers.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </AlertDescription>
                </Alert>
              </motion.div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="relative flex items-center">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={handleApiKeyChange}
                      placeholder="Enter your OpenAI API key"
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

              <AnimatePresence>
                {error && (
                  <motion.div {...fadeInUp} className="mt-6">
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

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
                                {result.parsedData ? (
                                  <div className="space-y-3">
                                    <h4 className="font-medium text-lg">{result.parsedData.step_name}</h4>
                                    
                                    {/* Display entire parsedData in a single div */}
                                    <div className="bg-background p-3 rounded">
                                      <pre className="font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(result.parsedData, null, 2)}
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
                              
                              {/* Display prerequisite workflows if available */}
                              {result.prerequisiteWorkflows && result.prerequisiteWorkflows.length > 0 && (
                                <div className="mt-4">
                                  <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="prerequisites">
                                      <AccordionTrigger className="py-2">
                                        <div className="flex items-center gap-2">
                                          <span>Prerequisite Workflows</span>
                                          <Badge variant="outline">{result.prerequisiteWorkflows.length}</Badge>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
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
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>
                                </div>
                              )}
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
