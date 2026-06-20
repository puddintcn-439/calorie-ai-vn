export type ParsedPortion = {
  grams: number | null;
  quantity: number;
  unit: 'g' | 'ml' | 'bowl' | 'piece' | 'cup' | null;
  matched: boolean;
};

const PORTION_GRAMS: Record<Exclude<ParsedPortion['unit'], 'g' | 'ml' | null>, number> = {
  bowl: 350,
  piece: 100,
  cup: 250,
};

export function parsePortionText(source: string): ParsedPortion {
  const normalized = source.trim().toLowerCase().replace(',', '.');
  const directWeight = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|ml)\b/i);
  if (directWeight) {
    const amount = Number(directWeight[1]);
    const rawUnit = directWeight[2].toLowerCase();
    const unit = rawUnit === 'ml' ? 'ml' : 'g';
    const grams = rawUnit === 'kg' ? amount * 1000 : amount;
    return {
      grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
      quantity: 1,
      unit,
      matched: true,
    };
  }

  const portion = normalized.match(/(\d+(?:\.\d+)?)?\s*(tô|bát|chén|bowl|cái|chiếc|piece|ly|cốc|cup)\b/i);
  if (!portion) {
    return { grams: null, quantity: 1, unit: null, matched: false };
  }

  const quantity = Math.max(1, Number(portion[1] ?? 1));
  const token = portion[2].toLowerCase();
  const unit: Exclude<ParsedPortion['unit'], 'g' | 'ml' | null> =
    ['tô', 'bát', 'chén', 'bowl'].includes(token)
      ? 'bowl'
      : ['ly', 'cốc', 'cup'].includes(token)
        ? 'cup'
        : 'piece';

  return {
    grams: Math.round(quantity * PORTION_GRAMS[unit]),
    quantity,
    unit,
    matched: true,
  };
}

export function scaleNutrition(
  base: { grams: number; calories: number; protein: number; carbs: number; fat: number },
  nextTotalGrams: number,
) {
  const ratio = Math.max(0, nextTotalGrams) / Math.max(1, base.grams);
  return {
    calories: Math.round(base.calories * ratio),
    protein: Math.round(base.protein * ratio * 10) / 10,
    carbs: Math.round(base.carbs * ratio * 10) / 10,
    fat: Math.round(base.fat * ratio * 10) / 10,
  };
}
