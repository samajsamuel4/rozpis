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
  fresh: { title: "Frisch", short: "Gemüse, Obst & Kräuter" },
  seafood: { title: "Fisch", short: "Fisch & Meeresfrüchte" },
  chilled: { title: "Kühl", short: "Kühlregal" },
  pantry: { title: "Vorrat", short: "Trockenware & Konserven" },
};

export function isShoppingCategory(value: string): value is ShoppingCategory {
  return (SHOPPING_CATEGORIES as readonly string[]).includes(value);
}
