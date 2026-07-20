/**
 * Configuration Schema Validation (#6)
 * Uses zod for strict schema enforcement — fails fast with clear messages.
 */
import { z } from 'zod';
export declare const ClientConfigSchema: z.ZodObject<{
    serverUrl: z.ZodString;
    appId: z.ZodString;
    functionsVersion: z.ZodOptional<z.ZodString>;
    headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    model: z.ZodString;
    ollamaEndpoints: z.ZodArray<z.ZodString>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        role: z.ZodString;
        content: z.ZodString;
    }, z.core.$strip>>>;
    rateLimit: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        maxCalls: z.ZodOptional<z.ZodNumber>;
        windowMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ClientConfig = z.infer<typeof ClientConfigSchema>;
/**
 * Validate config and return { valid, errors }.
 * Safe to call in production — never throws.
 */
export declare function validateClientConfig(config: unknown): {
    valid: boolean;
    errors: string[];
};
/**
 * Parse and return a strongly-typed ClientConfig, or throw a ZodError.
 * Use this at app initialisation for a "fail-fast" guarantee.
 */
export declare function parseClientConfig(config: unknown): ClientConfig;
