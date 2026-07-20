/**
 * Flight tracker — Ollama OpenAI-compatible tool-calling demo for flight times.
 *
 * The previous version of this file used the `ollama` npm SDK directly, but
 * that package is not installed in this project. The function below mirrors
 * the pattern used by `multi-tool.ts`: it relies on plain `fetch` against the
 * `/v1/chat/completions` endpoint so it works in both browser and Node.
 */
// Simulates an API call to get flight times
// In a real application, this would fetch data from a live database or API
function getFlightTimes(args) {
    const departure = args.departure;
    const arrival = args.arrival;
    const flights = {
        'LGA-LAX': { departure: '08:00 AM', arrival: '11:30 AM', duration: '5h 30m' },
        'LAX-LGA': { departure: '02:00 PM', arrival: '10:30 PM', duration: '5h 30m' },
        'LHR-JFK': { departure: '10:00 AM', arrival: '01:00 PM', duration: '8h 00m' },
        'JFK-LHR': { departure: '09:00 PM', arrival: '09:00 AM', duration: '7h 00m' },
        'CDG-DXB': { departure: '11:00 AM', arrival: '08:00 PM', duration: '6h 00m' },
        'DXB-CDG': { departure: '03:00 AM', arrival: '07:30 AM', duration: '7h 30m' },
    };
    const key = `${departure}-${arrival}`.toUpperCase();
    return JSON.stringify(flights[key] || { error: 'Flight not found' });
}
const getFlightTimesTool = {
    type: 'function',
    function: {
        name: 'get_flight_times',
        description: 'Get the flight times between two cities',
        parameters: {
            type: 'object',
            required: ['departure', 'arrival'],
            properties: {
                departure: {
                    type: 'string',
                    description: 'The departure city (airport code)',
                },
                arrival: {
                    type: 'string',
                    description: 'The arrival city (airport code)',
                },
            },
        },
    },
};
/**
 * Standalone flightTracker — calls Ollama's OpenAI-compatible
 * /v1/chat/completions endpoint with a mock flight-times tool.
 * Accepts an optional prompt (defaults to the LGA→LAX demo) and
 * returns the final assistant content string.
 */
export async function flightTracker(opts) {
    const { prompt, model: requestedModel = null, ollamaEndpoints, defaultModel, } = opts || {};
    const host = ollamaEndpoints[1] || ollamaEndpoints[0] || 'http://localhost:11434';
    const useModel = requestedModel || defaultModel || 'qwen3:0.6b';
    const availableFunctions = {
        get_flight_times: getFlightTimes,
    };
    const messages = [
        {
            role: 'user',
            content: prompt || 'What is the flight time from New York (LGA) to Los Angeles (LAX)?',
        },
    ];
    // First pass: ask model what tools to call
    const res1 = await fetch(`${host}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: useModel, messages, tools: [getFlightTimesTool], stream: false }),
    });
    if (!res1.ok)
        throw new Error(`flightTracker error: ${res1.status}`);
    const data1 = await res1.json();
    const assistantMsg = data1?.choices?.[0]?.message;
    if (!assistantMsg)
        return '';
    messages.push(assistantMsg);
    // Process function calls made by the model
    if (assistantMsg.tool_calls?.length) {
        for (const tool of assistantMsg.tool_calls) {
            const fn = availableFunctions[tool.function?.name];
            if (fn) {
                const functionResponse = fn(tool.function.arguments);
                messages.push({
                    role: 'tool',
                    content: functionResponse,
                    tool_call_id: tool.id,
                });
            }
        }
        // Second pass: get final response from the model
        const res2 = await fetch(`${host}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: useModel, messages, stream: false }),
        });
        if (!res2.ok)
            throw new Error(`flightTracker final error: ${res2.status}`);
        const data2 = await res2.json();
        return data2?.choices?.[0]?.message?.content ?? '';
    }
    return assistantMsg.content ?? '';
}
