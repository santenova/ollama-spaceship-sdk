#!/usr/bin/env tsx
/**
 * CLI runner for the Triple Validation Benchmark.
 *
 * Usage:
 *   npx tsx src/apis/lib/triple-validation-cli.ts [--cases <n>] [--models <n>]
 *
 * Options:
 *   --cases <n>    Number of test cases to benchmark (default: 50)
 *   --models <n>   Limit to first <n> models (0 = all, default: 0)
 *
 * Environment overrides:
 *   OLLAMA_ENDPOINT   Ollama base URL (default: http://127.0.0.1:11434)
 *   OLLAMA_MODEL      Fallback model when /v1/models is unreachable (default: llama3.2)
 *   ES_ENDPOINT       Elasticsearch URL (default: http://127.0.0.1:9200)
 */
export {};
