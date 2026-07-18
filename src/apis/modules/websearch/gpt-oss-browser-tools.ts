import { Browser } from './gpt-oss-browser-tools-helpers'
import { streamChatCompletion } from "../../lib/vanilla-ollama-fetch.ts";

export async function gptOssBrowserTools(host = "http://localhost:11434", model = "qwen3:8b") {
  // Browser-compatible search/fetch clients using vanilla fetch
  const browser = new Browser(undefined, {
    search: async (request) => {
      const query = request.query || "";
      const maxResults = request.max_results || 5;
      try {
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
        const data = await res.json();
        const results = [];
        if (data.AbstractText) results.push({ title: data.Heading, url: data.AbstractURL, content: data.AbstractText });
        if (data.RelatedTopics) {
          for (const t of data.RelatedTopics.slice(0, maxResults)) {
            if (t.Text && t.FirstURL) results.push({ title: t.Text.split(" - ")[0], url: t.FirstURL, content: t.Text });
          }
        }
        return { results: results.slice(0, maxResults) };
      } catch (e) {
        return { results: [] };
      }
    },
    fetch: async (request) => {
      const url = request.url || "";
      try {
        const res = await fetch(url);
        const text = await res.text();
        const clean = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        return { content: clean.slice(0, 8000), title: titleMatch ? titleMatch[1].trim() : url, url };
      } catch (e) {
        return { content: "", title: url, url };
      }
    },
  });

  const browserSearchTool = {
    type: "function",
    function: {
      name: "websearch",
      description: "Performs a web search for the given query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query string." },
          topn: { type: "number", description: "Max results to return (default 5)." },
        },
        required: ["query"],
      },
    },
  };

  const browserOpenTool = {
    type: "function",
    function: {
      name: "browser_open",
      description: "Open a search result or URL, or scroll the current page.",
      parameters: {
        type: "object",
        properties: {
          id: { description: "Link id (number) from the results page, or a URL string to open", anyOf: [{ type: "number" }, { type: "string" }] },
          cursor: { type: "number", description: "Page index in the stack to operate on" },
          loc: { type: "number", description: "Start line to view from" },
          num_lines: { type: "number", description: "Number of lines to display (-1 for auto)" },
        },
      },
    },
  };

  const browserFindTool = {
    type: "function",
    function: {
      name: "browser_find",
      description: "Find a pattern within the currently open page.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Text to search for in the page" },
          cursor: { type: "number", description: "Page index in the stack to search" },
        },
        required: ["pattern"],
      },
    },
  };

  const availableTools = {
    websearch: async (args) => { const result = await browser.search(args); return result.pageText; },
    browser_open: async (args) => { const result = await browser.open(args); return result.pageText; },
    browser_find: async (args) => { const result = await browser.find(args); return result.pageText; },
  };

  const messages = [{ role: "user", content: "what is ollama new engine?" }];

  console.log("Prompt:", messages.find((m) => m.role === "user")?.content, "\n");

  while (true) {
    const result = await streamChatCompletion(host, {
      model,
      messages,
      tools: [browserSearchTool, browserOpenTool, browserFindTool],
      think: true,
    });

    const hadToolCalls = result.tool_calls && result.tool_calls.length > 0;
    let startedThinking = false;
    let finishedThinking = false;

    if (result.thinking && !startedThinking) {
      startedThinking = true;
      console.log("Thinking:\n========\n");
    } else if (result.content && startedThinking && !finishedThinking) {
      finishedThinking = true;
      console.log("\n\nResponse:\n========\n");
    }

    if (result.thinking) console.log(result.thinking);
    if (result.content) console.log(result.content);

    if (!hadToolCalls) break;

    messages.push({ role: "assistant", content: result.content, thinking: result.thinking });

    for (const toolCall of result.tool_calls) {
      const fn = availableTools[toolCall.function?.name];
      if (fn) {
        const args = typeof toolCall.function?.arguments === "string"
          ? (() => { try { return JSON.parse(toolCall.function.arguments); } catch { return {}; } })()
          : (toolCall.function?.arguments || {});
        console.log("\nCalling function:", toolCall.function.name, "with arguments:", args);
        let output;
        try {
          output = await fn(args);
        } catch (error) {
          output = { error: error instanceof Error ? error.message : "Unknown error" };
        }
        messages.push({ role: "tool", content: JSON.stringify(output), tool_name: toolCall.function.name });
      }
    }
  }
}