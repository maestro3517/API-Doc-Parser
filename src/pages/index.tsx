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
import { Loader2 } from "lucide-react";

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
      <div className="bg-background min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto py-8 px-4 max-w-4xl">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>URL Processor</CardTitle>
              <CardDescription>
                Enter URLs (one per line) to process and extract information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Textarea
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    placeholder="https://example.com&#10;"
                    className="min-h-[200px]"
                  />
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Process URLs"
                  )}
                </Button>
              </form>

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {results.length > 0 && (
                <div className="mt-8 space-y-4">
                  <h2 className="text-2xl font-bold mb-4">Results</h2>
                  {results.map((result, index) => (
                    <Card key={index} className="p-4">
                      <h3 className="font-semibold mb-2 break-all">
                        {result.url}
                      </h3>
                      {result.status === "success" ? (
                        <div className="space-y-4">
                          {(() => {
                            const data = JSON.parse(result.result);
                            return (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="font-medium">Step Name:</span>
                                    <p className="mt-1">{data.step_name}</p>
                                  </div>
                                  <div>
                                    <span className="font-medium">Action:</span>
                                    <p className="mt-1">{data.action}</p>
                                  </div>
                                </div>

                                <div>
                                  <span className="font-medium">Inputs:</span>
                                  <pre className="mt-1 p-2 bg-muted rounded-md overflow-x-auto">
                                    {JSON.stringify(data.inputs, null, 2)}
                                  </pre>
                                </div>

                                <div>
                                  <span className="font-medium">API Config:</span>
                                  <pre className="mt-1 p-2 bg-muted rounded-md overflow-x-auto">
                                    {JSON.stringify(data.api_config, null, 2)}
                                  </pre>
                                </div>

                                <div>
                                  <span className="font-medium">Response Schema:</span>
                                  <pre className="mt-1 p-2 bg-muted rounded-md overflow-x-auto">
                                    {JSON.stringify(data.response_schema, null, 2)}
                                  </pre>
                                </div>

                                <div>
                                  <span className="font-medium">On Failure:</span>
                                  <p className="mt-1">{data.on_failure}</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <p className="text-destructive">{result.error}</p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
}
