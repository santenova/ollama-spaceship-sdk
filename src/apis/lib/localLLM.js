const STORAGE_KEY = "local_ai_config";

// Map Ollama model capabilities to app chat types
// capabilities from /api/show: "vision", "tools", "embedding", "thinking"
export function mapCapabilitiesToChatTypes(capabilities = [], modelName = "") {
  const name = modelName.toLowerCase();
  const caps = capabilities.map(c => c.toLowerCase());

  const chatTypes = [];

  // Vision → image models
  if (caps.includes("vision")) {
    chatTypes.push("image_quick");    // Quick Image
    chatTypes.push("image_detailed"); // Pro Image HD
  }

  // Thinking/reasoning → deep
  if (caps.includes("thinking") || name.includes("thinking") || name.includes("reason") || name.includes("deepseek-r") || name.includes("qwq")) {
    chatTypes.push("deep");
  }

  // Code-focused models
  if (name.includes("code") || name.includes("coder") || name.includes("codellama") || name.includes("starcoder") || name.includes("deepseek-coder")) {
    chatTypes.push("code");
  }

  // Embedding → not suitable for chat, skip

  // Default: all non-embedding models can handle quick, creative, data
  if (!caps.includes("embedding")) {
    if (!chatTypes.includes("local")) chatTypes.push("local");
    if (!chatTypes.includes("creative_writer")) chatTypes.push("creative_writer");
    if (!chatTypes.includes("data_analyst")) chatTypes.push("data_analyst");
    if (!chatTypes.includes("code") && !name.includes("vision")) chatTypes.push("code");
  }

  return chatTypes;
}

export function getLocalAIConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalAIConfig(endpoint, model, modelDetails = null, esEndpoint = null) {
  const existing = getLocalAIConfig() || {};
  const payload = { endpoint, model };
  // Merge new model details into existing
  const existingModels = existing.models || {};
  if (modelDetails && typeof modelDetails === "object") {
    payload.models = { ...existingModels, ...modelDetails };
  } else {
    payload.models = existingModels;
  }
  // Preserve or update ES endpoint
  if (esEndpoint !== null) {
    payload.esEndpoint = esEndpoint;
  } else if (existing.esEndpoint) {
    payload.esEndpoint = existing.esEndpoint;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearLocalAIConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Fetch details for a single model from Ollama /api/show
 * Returns { capabilities, chatTypes, details }
 */
export async function fetchModelDetails(endpoint, modelName) {
  const base = endpoint.replace(/\/$/, "");
  const res = await fetch(`${base}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const capabilities = data.capabilities || [];
  const chatTypes = mapCapabilitiesToChatTypes(capabilities, modelName);
  return {
    capabilities,
    chatTypes,
    family: data.details?.family || null,
    parameter_size: data.details?.parameter_size || null,
  };
}

/**
 * Fetch all models from /v1/models, then enrich each with /api/show details.
 * Returns { [modelName]: { capabilities, chatTypes, family, parameter_size } }
 */
export async function fetchAndEnrichModels(endpoint) {
  const base = endpoint.replace(/\/$/, "");
  const res = await fetch(`${base}/v1/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const names = (data.data || []).map((m) => m.id);

  // Check which models are already stored with details
  const existing = getLocalAIConfig() || {};
  const existingModels = existing.models || {};

  const modelDetails = {};
  await Promise.all(
    names.map(async (name) => {
      if (existingModels[name]?.capabilities) {
        // Already have details — reuse
        modelDetails[name] = existingModels[name];
      } else {
        const details = await fetchModelDetails(endpoint, name).catch(() => null);
        modelDetails[name] = details || { capabilities: [], chatTypes: ["local"] };
      }
    })
  );

  return { names, modelDetails };
}

/**
 * Calls a local Ollama instance via the OpenAI-compatible API.
 */
export async function InvokeLocalLLMLoged({ prompt, history = [], endpoint, model }) {
  const baseUrl = endpoint.replace(/\/$/, "");

  const messages = [
    { role: "system", content: prompt },
    ...history
  ];

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}