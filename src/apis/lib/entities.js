/**
 * Creates the entities module for the client
 *
 * @param config - Configuration object containing axios, appId, and getSocket
 * @returns Entities module with dynamic entity access
 * @internal
 */
export function createEntitiesModule(config) {
    const { axios, appId, getSocket } = config;
    // Using Proxy to dynamically handle entity names
    return new Proxy({}, {
        get(target, entityName) {
            // Don't create handlers for internal properties
            if (typeof entityName !== "string" ||
                entityName === "then" ||
                entityName.startsWith("_")) {
                return undefined;
            }
            // Create entity handler
            return createEntityHandler(axios, appId, entityName, getSocket);
        },
    });
}
/**
 * Parses the realtime message data and extracts event information.
 * @internal
 */
function parseRealtimeMessage(dataStr) {
    var _a;
    try {
        const parsed = JSON.parse(dataStr);
        return {
            type: parsed.type,
            data: parsed.data,
            id: parsed.id || ((_a = parsed.data) === null || _a === void 0 ? void 0 : _a.id),
            timestamp: parsed.timestamp || new Date().toISOString(),
        };
    }
    catch (error) {
        console.warn("[client] Failed to parse realtime message:", error);
        return null;
    }
}
/**
 * Creates a handler for a specific entity.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param entityName - Entity name
 * @param getSocket - Function to get the socket instance
 * @returns Entity handler with CRUD methods
 * @internal
 */
function createEntityHandler(axios, appId, entityName, getSocket) {
    const baseURL = `/api/entities/${entityName}`;
    return {
        // List entities with optional pagination and sorting
        async list(sort, limit, skip, fields) {
            const params = {};
            if (sort)
                params.sort = sort;
            if (limit)
                params.limit = limit;
            if (skip)
                params.skip = skip;
            if (fields)
                params.fields = Array.isArray(fields) ? fields.join(",") : fields;
            return axios.get(baseURL, { params });
        },
        // Filter entities based on query
        async filter(query, sort, limit, skip, fields) {
            const params = {
                q: JSON.stringify(query),
            };
            if (sort)
                params.sort = sort;
            if (limit)
                params.limit = limit;
            if (skip)
                params.skip = skip;
            if (fields)
                params.fields = Array.isArray(fields) ? fields.join(",") : fields;
            return axios.get(baseURL, { params });
        },
        // Get entity by ID
        async get(id) {
            return axios.get(`${baseURL}/${id}`);
        },
        // Create new entity
        async create(data) {
            return axios.post(baseURL, data);
        },
        // Update entity by ID
        async update(id, data) {
            return axios.put(`${baseURL}/${id}`, data);
        },
        // Delete entity by ID
        async delete(id) {
            return axios.delete(`${baseURL}/${id}`);
        },
        // Delete multiple entities based on query
        async deleteMany(query) {
            return axios.delete(baseURL, { data: query });
        },
        // Create multiple entities in a single request
        async bulkCreate(data) {
            return axios.post(`${baseURL}/bulk`, data);
        },
        // Update multiple entities matching a query using a MongoDB update operator
        async updateMany(query, data) {
            return axios.patch(`${baseURL}/update-many`, { query, data });
        },
        // Update multiple entities by ID, each with its own update data
        async bulkUpdate(data) {
            return axios.put(`${baseURL}/bulk`, data);
        },
        // Import entities from a file
        async importEntities(file) {
            const formData = new FormData();
            formData.append("file", file, file.name);
            return axios.post(`${baseURL}/import`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });
        },
        // Subscribe to realtime updates
        subscribe(callback) {
            const room = `entities:${appId}:${entityName}`;
            // Get the socket and subscribe to the room
            const socket = getSocket();
            const unsubscribe = socket.subscribeToRoom(room, {
                update_model: (msg) => {
                    const event = parseRealtimeMessage(msg.data);
                    if (!event) {
                        return;
                    }
                    try {
                        callback(event);
                    }
                    catch (error) {
                        console.error("[client]  callback error:", error);
                    }
                },
            });
            return unsubscribe;
        },
    };
}
