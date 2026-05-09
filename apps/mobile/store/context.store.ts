import { create } from 'zustand';
import { ContextMode, UserContextState } from '@calorie-ai/types';

interface ContextStoreState {
  activeContexts: ContextMode[];
  notes: string | null;
  enabledAt: Record<ContextMode, Date | null>;
  
  // Actions
  toggleContext: (mode: ContextMode) => void;
  setContexts: (modes: ContextMode[]) => void;
  setNotes: (notes: string | null) => void;
  clearAllContexts: () => void;
  hasContext: (mode: ContextMode) => boolean;
  getContextState: () => UserContextState;
}

export const useContextStore = create<ContextStoreState>((set, get) => ({
  activeContexts: [],
  notes: null,
  enabledAt: {
    [ContextMode.STRESS]: null,
    [ContextMode.PERIOD]: null,
    [ContextMode.BUSY_WORK]: null,
    [ContextMode.TRAVEL]: null,
    [ContextMode.POOR_SLEEP]: null,
    [ContextMode.EVENT]: null,
    [ContextMode.RECOVERY]: null,
    [ContextMode.NORMAL]: null,
  },

  toggleContext: (mode: ContextMode) => {
    set((state) => {
      const activeContexts = state.activeContexts.includes(mode)
        ? state.activeContexts.filter((m) => m !== mode)
        : [...state.activeContexts, mode];

      const enabledAt = {
        ...state.enabledAt,
        [mode]: activeContexts.includes(mode) ? new Date() : null,
      };

      return { activeContexts, enabledAt };
    });
  },

  setContexts: (modes: ContextMode[]) => {
    set((state) => {
      const enabledAt = { ...state.enabledAt };
      
      // Clear all
      Object.keys(enabledAt).forEach((key) => {
        enabledAt[key as ContextMode] = null;
      });
      
      // Set new ones
      modes.forEach((mode) => {
        enabledAt[mode] = new Date();
      });

      return { activeContexts: modes, enabledAt };
    });
  },

  setNotes: (notes: string | null) => {
    set({ notes });
  },

  clearAllContexts: () => {
    set({
      activeContexts: [],
      notes: null,
      enabledAt: {
        [ContextMode.STRESS]: null,
        [ContextMode.PERIOD]: null,
        [ContextMode.BUSY_WORK]: null,
        [ContextMode.TRAVEL]: null,
        [ContextMode.POOR_SLEEP]: null,
        [ContextMode.EVENT]: null,
        [ContextMode.RECOVERY]: null,
        [ContextMode.NORMAL]: null,
      },
    });
  },

  hasContext: (mode: ContextMode) => {
    return get().activeContexts.includes(mode);
  },

  getContextState: (): UserContextState => {
    const state = get();
    return {
      activeContexts: state.activeContexts,
      enabledAt: state.enabledAt,
      notes: state.notes ?? undefined,
    };
  },
}));
