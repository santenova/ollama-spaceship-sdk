/**
 * client.integration.test.ts
 *
 * Jest integration test suite — wraps all suites from client.test.ts
 * and runs them against real endpoints (Ollama @ 127.0.0.1:11434, ES @ 127.0.0.1:9200).
 * No fetch mocks — every test hits a live service.
 */
export {};
