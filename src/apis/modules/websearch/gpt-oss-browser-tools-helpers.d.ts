import type { SearchRequest, SearchResponse, FetchRequest, FetchResponse } from 'ollama';
interface Page {
    url: string;
    title: string;
    text: string;
    lines: string[];
    links: Record<number, string>;
    fetchedAt: Date;
}
interface BrowserStateData {
    pageStack: string[];
    viewTokens: number;
    urlToPage: Record<string, Page>;
}
interface WebSearchResult {
    title?: string;
    url?: string;
    content: {
        fullText: string;
    };
}
/**
 * The Browser tool provides web browsing capability.
 * The model uses the tool by usually doing a search first and then choosing to either open a page,
 * find a term in a page, or do another search.
 *
 * The tool optionally may open a URL directly - especially if one is passed in.
 *
 * Each action is saved into an append-only page stack to keep track of the history of the browsing session.
 * Each Execute() for a tool returns the full current state of the browser.
 *
 * A new Browser object is created per request - the state is managed within the class.
 */
/**
 * BrowserState manages the browsing session state
 */
export declare class BrowserState {
    private data;
    constructor(initialState?: BrowserStateData);
    getData(): BrowserStateData;
    setData(data: BrowserStateData): void;
}
export declare class Browser {
    state: BrowserState;
    private searchClient?;
    private fetchClient?;
    constructor(initialState?: BrowserStateData, client?: {
        search: (request: SearchRequest) => Promise<SearchResponse>;
        fetch: (request: FetchRequest) => Promise<FetchResponse>;
    });
    setClients(client: {
        search: (request: SearchRequest) => Promise<SearchResponse>;
        fetch: (request: FetchRequest) => Promise<FetchResponse>;
    }): void;
    getState(): BrowserStateData;
    protected savePage(page: Page): void;
    protected getPageFromStack(url: string): Page;
    /**
     * Calculates the end location for viewport based on token limits
     */
    protected getEndLoc(loc: number, numLines: number, totalLines: number, lines: string[]): number;
    protected joinLinesWithNumbers(lines: string[]): string;
    /**
     * Processes markdown links and replaces them with the special format
     * Returns the processed text and a map of link IDs to URLs
     */
    protected processMarkdownLinks(text: string): {
        processedText: string;
        links: Record<number, string>;
    };
    /**
     * Wraps text lines to a specified width
     */
    protected wrapLines(text: string, width?: number): string[];
    /**
     * Formats and returns the page display for the model
     */
    protected displayPage(page: Page, cursor: number, loc: number, numLines: number): string;
    /**
     * Builds a search results page that contains all search results
     */
    protected buildSearchResultsPageCollection(query: string, results: SearchResponse): Page;
    /**
     * Builds a search results page for individual result
     */
    protected buildSearchResultsPage(result: WebSearchResult, linkIdx: number): Page;
    /**
     * Creates a Page from fetch API results
     */
    protected buildPageFromFetchResult(requestedURL: string, fetchResponse: FetchResponse): Page;
    /**
     * Builds a find results page
     */
    protected buildFindResultsPage(pattern: string, page: Page): Page;
    search(args: {
        query: string;
        topn?: number;
    }): Promise<{
        state: BrowserStateData;
        pageText: string;
    }>;
    open(args: {
        id?: string | number;
        cursor?: number;
        loc?: number;
        num_lines?: number;
    }): Promise<{
        state: BrowserStateData;
        pageText: string;
    }>;
    find(args: {
        pattern: string;
        cursor?: number;
    }): Promise<{
        state: BrowserStateData;
        pageText: string;
    }>;
}
export {};
//# sourceMappingURL=gpt-oss-browser-tools-helpers.d.ts.map