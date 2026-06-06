import type { DynamicIntervention, InterventionAnalytics, InterventionEventInput, InterventionMemory } from '@calorie-ai/types';
import { apiClient } from './api';
import { appLogger } from './logger.service';

export function buildInterventionEvent(
  intervention: DynamicIntervention,
  eventType: InterventionEventInput['event_type'],
  source: InterventionEventInput['source'] = 'today',
  metadata?: Record<string, unknown>,
): InterventionEventInput {
  return {
    intervention_type: intervention.intervention_type,
    mode: intervention.mode,
    priority: intervention.priority,
    primary_action: intervention.primary_action,
    event_type: eventType,
    source,
    intervention_generated_at: intervention.generated_at,
    metadata: {
      cooldown_hours: intervention.cooldown_hours,
      reasons: intervention.reasons,
      ...metadata,
    },
  };
}

export async function recordInterventionEvent(event: InterventionEventInput): Promise<boolean> {
  try {
    const res = await apiClient.post<{ recorded: boolean }>('/coaching/interventions/events', event);
    return res.data.recorded === true;
  } catch (error) {
    appLogger.warn('InterventionMemory', 'Failed to record intervention event', error);
    return false;
  }
}

export async function fetchInterventionMemory(days = 90): Promise<InterventionMemory> {
  const res = await apiClient.get<InterventionMemory>(`/coaching/interventions/memory?days=${days}`);
  return res.data;
}

export async function fetchInterventionAnalytics(minSample = 20): Promise<InterventionAnalytics> {
  const res = await apiClient.get<InterventionAnalytics>(`/coaching/interventions/analytics?min_sample=${minSample}`);
  return res.data;
}
