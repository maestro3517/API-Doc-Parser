import React, { useState } from "react";
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
import { Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [urls, setUrls] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Split URLs by newline and filter out empty lines
      const urlList = urls
        .split("\n")
        .map((url) => url.trim())
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
    transition: { duration: 0.5 }
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
                  Enter URLs (one per line) to process and extract information
                </CardDescription>
              </motion.div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <motion.div 
                  className="space-y-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Textarea
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    placeholder="https://example.com&#10;"
                    className="min-h-[200px] transition-all duration-200 focus:shadow-lg"
                  />
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <Button type="submit" disabled={loading} className="w-full text-lg py-6">
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
                  <motion.div
                    {...fadeInUp}
                    className="mt-6"
                  >
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                {results.length > 0 && (
                  <motion.div
                    {...fadeInUp}
                    className="mt-8 space-y-4"
                  >
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
                            <div className="bg-muted/50 p-4 rounded-lg">
                              <pre className="mt-2 p-3 bg-background rounded-md overflow-x-auto whitespace-pre-wrap">
                                {result.result}
                              </pre>
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
