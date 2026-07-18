/**
 * Ollama endpoint helper — delegates to endpointRegistry (single source of truth).
 * Kept for backwards compatibility with existing imports.
 */
import { endpointRegistry } from './endpoint-registry';

export const getOllamaEndpoint = (): string => endpointRegistry.ollama();