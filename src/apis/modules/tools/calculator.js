/**
 * Calculator — Ollama OpenAI-compatible tool-calling demo for arithmetic.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below mirrors
 * the pattern used by `multi-tool.ts`: it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
// Add two numbers function
function addTwoNumbers(args) {
    return args.a + args.b;
}
// Subtract two numbers function
function subtractTwoNumbers(args) {
    return args.a - args.b;
}
// Tool definition for add function
const addTwoNumbersTool = {
    type: 'function',
    function: {
        name: 'addTwoNumbers',
        description: 'Add two numbers together',
        parameters: {
            type: 'object',
            required: ['a', 'b'],
            properties: {
                a: { type: 'number', description: 'The first number' },
                b: { type: 'number', description: 'The second number' },
            },
        },
    },
};
// Tool definition for subtract function
const subtractTwoNumbersTool = {
    type: 'function',
    function: {
        name: 'subtractTwoNumbers',
        description: 'Subtract two numbers',
        parameters: {
            type: 'object',
            required: ['a', 'b'],
            properties: {
                a: { type: 'number', description: 'The first number' },
                b: { type: 'number', description: 'The second number' },
            },
        },
    },
};
/**
 * Standalone calculator — calls Ollama's OpenAI-compatible
 * /v1/chat/completions endpoint with add/subtract tools.
 * Accepts an optional prompt (defaults to "three minus one") and
 * returns the final assistant content string.
 */
export async function calculator(opts) {
    const { prompt, model: requestedModel = null, ollamaEndpoints, defaultModel, } = opts || {};
    const host = ollamaEndpoints[1] || ollamaEndpoints[0] || 'http://localhost:11434';
    const useModel = requestedModel || defaultModel || 'qwen3:0.6b';
    const availableFunctions = {
        addTwoNumbers,
        subtractTwoNumbers,
    };
    const messages = [
        { role: 'user', content: prompt || 'What is three minus one?' },
    ];
    // First pass: ask model what tools to call
    const res1 = await fetch(`${host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: useModel,
            messages,
            tools: [addTwoNumbersTool, subtractTwoNumbersTool],
            stream: false,
        }),
    });
    if (!res1.ok)
        throw new Error(`calculator error: ${res1.status}`);
    const data1 = await res1.json();
    const assistantMsg = data1?.choices?.[0]?.message;
    if (!assistantMsg)
        return '';
    messages.push(assistantMsg);
    if (assistantMsg.tool_calls?.length) {
        for (const tool of assistantMsg.tool_calls) {
            const fn = availableFunctions[tool.function?.name];
            if (fn) {
                const output = fn(tool.function.arguments);
                messages.push({
                    role: 'tool',
                    content: output.toString(),
                    tool_call_id: tool.id,
                });
            }
        }
        // Second pass: get final response from model with function outputs
        const res2 = await fetch(`${host}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: useModel, messages, stream: false }),
        });
        if (!res2.ok)
            throw new Error(`calculator final error: ${res2.status}`);
        const data2 = await res2.json();
        return data2?.choices?.[0]?.message?.content ?? '';
    }
    return assistantMsg.content ?? '';
}
