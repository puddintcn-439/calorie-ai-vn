/**
 * Life context modes for adaptive coaching
 * Enables app to adjust nudge tone, calorie targets, and feedback based on user's real-life situation
 */

export enum ContextMode {
  STRESS = 'stress',
  PERIOD = 'period', // kỳ kinh nguyệt
  BUSY_WORK = 'busy_work', // OT / quá bận
  TRAVEL = 'travel', // du lịch
  POOR_SLEEP = 'poor_sleep', // ngủ kém
  EVENT = 'event', // tiệc / sự kiện xã hội
  RECOVERY = 'recovery', // recovery / phục hồi
  NORMAL = 'normal',
}

export type ContextModeType = `${ContextMode}`;

export interface UserContextState {
  activeContexts: ContextMode[];
  enabledAt: Record<ContextMode, Date | null>;
  notes?: string; // User's note about why this context is active
}

export interface ContextAdapter {
  mode: ContextMode;
  caloricBufferPercent: number; // e.g., +10% for stress, -5% for recovery
  judgmentLevel: 'lenient' | 'balanced' | 'strict'; // tone of feedback
  nudgeFrequency: 'frequent' | 'normal' | 'minimal'; // how often to nudge
  feedbackTone: string; // e.g., "reassuring", "energizing", "grounding"
  coachingTheme: string; // e.g., "be kind to yourself", "fuel your energy", "you got this"
}

// Adapter defaults for each context
export const CONTEXT_ADAPTERS: Record<ContextMode, ContextAdapter> = {
  [ContextMode.STRESS]: {
    mode: ContextMode.STRESS,
    caloricBufferPercent: 15,
    judgmentLevel: 'lenient',
    nudgeFrequency: 'minimal',
    feedbackTone: 'grounding',
    coachingTheme: 'Hôm nay bạn đang áp lực. Cùng bạn pass qua ngày này nhé 💙',
  },
  [ContextMode.PERIOD]: {
    mode: ContextMode.PERIOD,
    caloricBufferPercent: 10,
    judgmentLevel: 'lenient',
    nudgeFrequency: 'minimal',
    feedbackTone: 'nurturing',
    coachingTheme: 'Cơ thể bạn cần năng lượng hôm nay. Đó là bình thường 💪',
  },
  [ContextMode.BUSY_WORK]: {
    mode: ContextMode.BUSY_WORK,
    caloricBufferPercent: 8,
    judgmentLevel: 'balanced',
    nudgeFrequency: 'normal',
    feedbackTone: 'energizing',
    coachingTheme: 'Bạn đang bận. Hãy tìm thời gian nhỏ để log đến để có năng lượng đủ 🚀',
  },
  [ContextMode.TRAVEL]: {
    mode: ContextMode.TRAVEL,
    caloricBufferPercent: 12,
    judgmentLevel: 'lenient',
    nudgeFrequency: 'minimal',
    feedbackTone: 'adventurous',
    coachingTheme: 'Hưởng thụ du lịch! Logging giúp bạn cân bằng, không hạn chế ✈️',
  },
  [ContextMode.POOR_SLEEP]: {
    mode: ContextMode.POOR_SLEEP,
    caloricBufferPercent: 8,
    judgmentLevel: 'lenient',
    nudgeFrequency: 'minimal',
    feedbackTone: 'supportive',
    coachingTheme: 'Ngủ kém => cơ thể muốn thêm năng lượng. Đó là khoa học 💤',
  },
  [ContextMode.EVENT]: {
    mode: ContextMode.EVENT,
    caloricBufferPercent: 10,
    judgmentLevel: 'balanced',
    nudgeFrequency: 'minimal',
    feedbackTone: 'celebratory',
    coachingTheme: 'Thưởng thức khoảnh khắc! Log lại để biết và cân bằng sau 🎉',
  },
  [ContextMode.RECOVERY]: {
    mode: ContextMode.RECOVERY,
    caloricBufferPercent: 5,
    judgmentLevel: 'strict',
    nudgeFrequency: 'frequent',
    feedbackTone: 'motivating',
    coachingTheme: 'Bạn đang quay lại. Mỗi log là 1 bước tiến 🔥',
  },
  [ContextMode.NORMAL]: {
    mode: ContextMode.NORMAL,
    caloricBufferPercent: 0,
    judgmentLevel: 'balanced',
    nudgeFrequency: 'normal',
    feedbackTone: 'balanced',
    coachingTheme: 'Tiếp tục với lộ trình của bạn!',
  },
};

/**
 * Get the active context adapter (pick the most "lenient" one if multiple active)
 * Priority: STRESS > PERIOD > POOR_SLEEP > TRAVEL > BUSY_WORK > EVENT > RECOVERY > NORMAL
 */
export function getActiveContextAdapter(contexts: ContextMode[]): ContextAdapter {
  if (!contexts || contexts.length === 0) {
    return CONTEXT_ADAPTERS[ContextMode.NORMAL];
  }

  const priority = [
    ContextMode.STRESS,
    ContextMode.PERIOD,
    ContextMode.POOR_SLEEP,
    ContextMode.TRAVEL,
    ContextMode.BUSY_WORK,
    ContextMode.EVENT,
    ContextMode.RECOVERY,
    ContextMode.NORMAL,
  ];

  for (const mode of priority) {
    if (contexts.includes(mode)) {
      return CONTEXT_ADAPTERS[mode];
    }
  }

  return CONTEXT_ADAPTERS[ContextMode.NORMAL];
}
