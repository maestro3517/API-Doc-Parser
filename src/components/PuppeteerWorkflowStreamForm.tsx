import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PuppeteerWorkflowStreamFormProps {
  onResult?: (result: any) => void;
}

const PuppeteerWorkflowStreamForm: React.FC<PuppeteerWorkflowStreamFormProps> = ({ onResult }) => {
  const [url, setUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url) {
      toast.error("Please enter a URL");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/process-with-puppeteer-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          aiApiKey: aiApiKey || undefined,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process URL');
      }

      if (onResult) {
        onResult(data);
      }

      toast.success("Successfully processed API documentation");
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="url">API Documentation URL</Label>
        <Input
          id="url"
          type="url"
          placeholder="https://api.example.com/docs"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="aiApiKey">
          AI API Key (Optional)
        </Label>
        <Input
          id="aiApiKey"
          type="password"
          placeholder="sk-..."
          value={aiApiKey}
          onChange={(e) => setAiApiKey(e.target.value)}
          disabled={isLoading}
        />
        <p className="text-sm text-muted-foreground">
          Provide an OpenAI API key to use AI-based processing for better results
        </p>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Process API Documentation'
        )}
      </Button>
    </form>
  );
};

export default PuppeteerWorkflowStreamForm; 