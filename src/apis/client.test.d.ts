/**
 * apis/client.test.ts
 *
 * Self-contained test suite — no browser globals, no module imports from the app.
 * Works in Node / ts-node / Deno out of the box.
 *
 * Usage (Node / ts-node):
 *   npx ts-node apis/client.test.ts
 *
 * Usage (browser console):
 *   import { runAllTests } from './apis/client.test.ts';
 *   await runAllTests();
 *
 * Config via env vars (all optional):
 *   OLLAMA_ENDPOINT=http://127.0.0.1:11434
 *   OLLAMA_MODEL=
 * 3:8b
 *   ES_ENDPOINT=http://127.0.0.1:9200
 */
type TestResult = {
    name: string;
    pass: boolean;
    output: string[];
    error?: string;
};
declare function getEndpoint(): string;
declare function getModel(): string;
declare function testCalculator(): Promise<TestResult>;
declare function testB1ConfigSchema(): Promise<TestResult>;
declare function testC18PromptRouter(): Promise<TestResult>;
declare function testC1EndpointResolution(): Promise<TestResult>;
declare function testC19Vision(): Promise<TestResult>;
declare const SUITE_A: (typeof testCalculator)[];
declare const SUITE_B: (typeof testB1ConfigSchema)[];
declare const SUITE_C: (typeof testC1EndpointResolution)[];
declare const ALL_TESTS: (typeof testCalculator)[];
export declare function runAllTests(): Promise<void>;
export declare function runTest(index: number): Promise<TestResult>;
export declare function runSuiteA(): Promise<void>;
export declare function runSuiteB(): Promise<void>;
export declare function runSuiteC(): Promise<void>;
export { ALL_TESTS as TESTS, SUITE_A, SUITE_B, SUITE_C, getEndpoint, getModel };
export { testC18PromptRouter, testC19Vision, testC21VisionStructured, testC22ClientInfraWiring, testC23Vector, testC24StreamResponseChat, testC25StreamResponseVision, testC26StreamResponseAbort };
declare function testC21VisionStructured(): Promise<TestResult>;
declare function testC23Vector(): Promise<TestResult>;
declare function testC24StreamResponseChat(): Promise<TestResult>;
declare function testC25StreamResponseVision(): Promise<TestResult>;
declare function testC26StreamResponseAbort(): Promise<TestResult>;
declare function testC22ClientInfraWiring(): Promise<TestResult>;
declare function testD1CostEstimator(): Promise<TestResult>;
declare function testE1OpenAIFetch(): Promise<TestResult>;
declare const SUITE_D: (typeof testD1CostEstimator)[];
declare const SUITE_E: (typeof testE1OpenAIFetch)[];
export { SUITE_D, SUITE_E };
export declare function runSuiteD(): Promise<void>;
export declare function runSuiteE(): Promise<void>;
