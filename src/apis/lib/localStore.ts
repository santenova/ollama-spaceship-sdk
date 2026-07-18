
/**
 * Sets a value in localStorage with the specified key.
 * @param key - The key under which to store the value.
 * @param value - The value to store. It will be automatically converted to JSON string if it's an object or array.
 */
export function setItem(key: string, value: any): void {
  try {
    const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    localStorage.setItem(key, serializedValue);
  } catch (error) {
    console.error(`Error setting localStorage item with key "${key}":`, error);
  }
}

/**
 * Gets a value from localStorage by the specified key.
 * @param key - The key for which to retrieve the value.
 * @returns The stored value, parsed if it's a JSON string. Returns `null` if the key does not exist.
 */
export function getItem<T>(key: string): T | null {
  try {
    const serializedValue = localStorage.getItem(key);
    return serializedValue ? (JSON.parse(serializedValue) as T) : null;
  } catch (error) {
    console.error(`Error getting localStorage item with key "${key}":`, error);
    return null;
  }
}

/**
 * Removes a value from localStorage by the specified key.
 * @param key - The key of the item to remove.
 */
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing localStorage item with key "${key}":`, error);
  }
}

/**
 * Clears all items from localStorage.
 */
export function clear(): void {
  try {
    localStorage.clear();
  } catch (error) {
    console.error("Error clearing localStorage:", error);
  }
}



export function localStorage() {
 return window.localStorage;
}
