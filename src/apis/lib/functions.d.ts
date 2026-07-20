/**
 * Creates the functions module for the client
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param config - Optional configuration for fetch functionality
 * @returns Functions module with methods to invoke custom backend functions
 * @internal
 */
export declare function createFunctionsModule(axios: any, appId: any, config: any): {
    invoke(functionName: any, data: any): Promise<any>;
    fetch(path: any, init?: Record<string, any>): Promise<Response>;
};
