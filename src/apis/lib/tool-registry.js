/**
 * Tool/Plugin Registry (Improvement #6)
 * Allows dynamic registration and retrieval of integration capabilities.
 */
const registry = new Map();
export const toolRegistry = {
    /** Register a named tool/integration */
    register(name, handler) {
        registry.set(name, handler);
    },
    /** Unregister a tool */
    unregister(name) {
        registry.delete(name);
    },
    /** Call a registered tool by name */
    async call(name, ...args) {
        const handler = registry.get(name);
        if (!handler)
            throw new Error(`Tool "${name}" is not registered.`);
        return handler(...args);
    },
    /** Check if a tool is registered */
    has(name) {
        return registry.has(name);
    },
    /** List all registered tool names */
    list() {
        return Array.from(registry.keys());
    },
    /** Build a Core integrations object from all registered tools */
    toCoreIntegrations() {
        return Object.fromEntries(registry.entries());
    },
};
