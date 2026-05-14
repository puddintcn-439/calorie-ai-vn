import { authStorage } from './auth-storage';

const PRESETS_KEY = 'strength_presets_v1';

const DEFAULT_PRESETS = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'];

export async function loadPresets(): Promise<string[]> {
  try {
    const raw = await authStorage.getItemAsync(PRESETS_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return DEFAULT_PRESETS;
  } catch (err) {
    console.warn('loadPresets failed', err);
    return DEFAULT_PRESETS;
  }
}

export async function savePreset(name: string): Promise<void> {
  if (!name || name.trim().length === 0) return;
  try {
    const presets = await loadPresets();
    const updated = [name, ...presets.filter((p) => p !== name)].slice(0, 50);
    await authStorage.setItemAsync(PRESETS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('savePreset failed', err);
  }
}

export async function removePreset(name: string): Promise<void> {
  try {
    const presets = await loadPresets();
    const updated = presets.filter((p) => p !== name);
    await authStorage.setItemAsync(PRESETS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('removePreset failed', err);
  }
}

export async function setAllPresets(list: string[]): Promise<void> {
  try {
    await authStorage.setItemAsync(PRESETS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (err) {
    console.warn('setAllPresets failed', err);
  }
}

export default { loadPresets, savePreset, removePreset, setAllPresets };
