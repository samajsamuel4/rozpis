export const SHOPPING_CATEGORIES = [
  "fresh",
  "seafood",
  "chilled",
  "pantry",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export type ShoppingItem = {
  id: number;
  category: ShoppingCategory;
  label: string;
  done: boolean;
  sort_order: number;
  created_at: string;
};

export const SHOPPING_CATEGORY_AT: Record<
  ShoppingCategory,
  { title: string; short: string }
> = {
  fresh: { title: "Frisch", short: "Gemüse & Kräuter" },
  seafood: { title: "Fisch", short: "Meeresfrüchte" },
  chilled: { title: "Kühl", short: "Kühlware" },
  pantry: { title: "Vorrat", short: "Trockenware" },
};

export function isShoppingCategory(value: string): value is ShoppingCategory {
  return (SHOPPING_CATEGORIES as readonly string[]).includes(value);
}
