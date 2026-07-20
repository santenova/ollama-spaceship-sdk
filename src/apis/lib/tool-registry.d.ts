/**
 * Tool/Plugin Registry (Improvement #6)
 * Allows dynamic registration and retrieval of integration capabilities.
 */
type ToolHandler = (...args: any[]) => Promise<any>;
export declare const toolRegistry: {
    /** Register a named tool/integration */
    register(name: string, handler: ToolHandler): void;
    /** Unregister a tool */
    unregister(name: string): void;
    /** Call a registered tool by name */
    call(name: string, ...args: any[]): Promise<any>;
    /** Check if a tool is registered */
    has(name: string): boolean;
    /** List all registered tool names */
    list(): string[];
    /** Build a Core integrations object from all registered tools */
    toCoreIntegrations(): Record<string, ToolHandler>;
};
export {};
