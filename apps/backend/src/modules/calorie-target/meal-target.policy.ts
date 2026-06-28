export const DEFAULT_MEAL_ENERGY_DISTRIBUTION = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.30,
  snack: 0.10,
} as const;

/**
 * Product planning default, not a clinical recommendation. Consumers should
 * prefer persisted user meal targets when the user has customized them.
 */
export function calculateDefaultMealTargets(totalCalories: number) {
  return {
    breakfast: Math.round(totalCalories * DEFAULT_MEAL_ENERGY_DISTRIBUTION.breakfast),
    lunch: Math.round(totalCalories * DEFAULT_MEAL_ENERGY_DISTRIBUTION.lunch),
    dinner: Math.round(totalCalories * DEFAULT_MEAL_ENERGY_DISTRIBUTION.dinner),
    snack: Math.round(totalCalories * DEFAULT_MEAL_ENERGY_DISTRIBUTION.snack),
  };
}
