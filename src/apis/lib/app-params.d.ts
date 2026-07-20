export declare const localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>;
export declare const token = "_token_";
export declare const appId = "ollama-browser-tools";
export declare const functionsVersion: any;
export declare const APP_PREFIX: string;
export declare const LS_PREFIX: string;
export declare const getAppParams: () => {
    appId: any;
    appPrefix: any;
    serverUrl: any;
    token: any;
    fromUrl: any;
    functionsVersion: any;
    appBaseUrl: any;
};
export declare const appParams: {
    appId: any;
    appPrefix: any;
    serverUrl: any;
    token: any;
    fromUrl: any;
    functionsVersion: any;
    appBaseUrl: any;
};
export declare const appBaseUrl: any;
