import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.sessionStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const authStorage = {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
};