/**
 * Tool/Plugin Registry (Improvement #6)
 * Allows dynamic registration and retrieval of integration capabilities.
 */

type ToolHandler = (...args: any[]) => Promise<any>;

const registry = new Map<string, ToolHandler>();

export const toolRegistry = {
  /** Register a named tool/integration */
  register(name: string, handler: ToolHandler) {
    registry.set(name, handler);
  },

  /** Unregister a tool */
  unregister(name: string) {
    registry.delete(name);
  },

  /** Call a registered tool by name */
  async call(name: string, ...args: any[]): Promise<any> {
    const handler = registry.get(name);
    if (!handler) throw new Error(`Tool "${name}" is not registered.`);
    return handler(...args);
  },

  /** Check if a tool is registered */
  has(name: string): boolean {
    return registry.has(name);
  },

  /** List all registered tool names */
  list(): string[] {
    return Array.from(registry.keys());
  },

  /** Build a Core integrations object from all registered tools */
  toCoreIntegrations(): Record<string, ToolHandler> {
    return Object.fromEntries(registry.entries());
  },
};