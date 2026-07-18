/**
 * Configuration Schema Validation (#6)
 * Uses zod for strict schema enforcement — fails fast with clear messages.
 */

import { z } from 'zod';

export const ClientConfigSchema = z.object({
  serverUrl: z.string().min(1, 'serverUrl is required'),
  appId: z.string().min(1, 'appId is required'),
  functionsVersion: z.string().optional(),
  headers: z.record(z.string()).default({}),
  model: z.string().min(1, 'model is required'),
  ollamaEndpoints: z.array(z.string()).min(1, 'ollamaEndpoints must be a non-empty array'),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  rateLimit: z.object({ maxCalls: z.number().optional(), windowMs: z.number().optional() }).nullable().optional(),
});

export type ClientConfig = z.infer<typeof ClientConfigSchema>;

/**
 * Validate config and return { valid, errors }.
 * Safe to call in production — never throws.
 */
export function validateClientConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = ClientConfigSchema.safeParse(config);
  if (result.success) return { valid: true, errors: [] };
  const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
  return { valid: false, errors };
}

/**
 * Parse and return a strongly-typed ClientConfig, or throw a ZodError.
 * Use this at app initialisation for a "fail-fast" guarantee.
 */
export function parseClientConfig(config: unknown): ClientConfig {
  return ClientConfigSchema.parse(config);
}