import * as SecureStore from 'expo-secure-store';

/** Android Keystore-backed storage for small secrets (entitlement cache, keys). */
export async function secureGet<T>(key: string): Promise<T | null> {
  try {
    const v = await SecureStore.getItemAsync(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    /* secure storage unavailable; ignore */
  }
}

export async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}
