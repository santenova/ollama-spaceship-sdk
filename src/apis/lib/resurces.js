"use strict";
async function fetchModelIds() {
    const response = await fetch('https://christy-ramentaceous-verbatim.ngrok-free.dev/v1/models');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.data.map((model) => model.id);
}
async function fetchModelCapabilities(modelId) {
    const response = await fetch('http://localhost:11434/api/show', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: modelId,
        }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return {
        model: modelId,
        capabilities: data.capabilities,
        modified: data.modified_at,
        model_info: data.model_info,
    };
}
async function capabel() {
    const modelIds = await fetchModelIds();
    console.log(modelIds);
}
