// src/screens/customer/home-categories.ts
//
// Home shows the big categories (Catalog V2, 19/10/2026); tapping one opens its services. The names, order
// and which ones exist come from `GET /categories`; only the picture of each is chosen here, from the artwork
// of one representative service of that category.
import type { CategoryItem } from '../../api/services.api';

/** Service code whose artwork stands for each `CAT_*` category on Home. */
const REPRESENTATIVE_SERVICE: Readonly<Record<string, string>> = {
  CAT_AC: 'AC-02',
  CAT_LAUNDRY: 'WM-01',
  CAT_FRIDGE: 'FR-01',
  CAT_RO: 'RO-03',
  CAT_HEATER: 'WH-01',
  CAT_KITCHEN: 'KT-01',
  CAT_ELECTRIC: 'EL-02',
  CAT_LIGHT_FAN: 'LF-02',
  CAT_PIPE: 'PI-01',
  CAT_PUMP: 'PU-01',
  CAT_SANITARY: 'SA-02',
  CAT_TV: 'TV-01',
  CAT_LOCK: 'LK-02',
};

export interface HomeCategory {
  id: string;
  code: string;
  name: string;
  /** Code handed to `ServiceArtwork`; an unknown category gets the neutral picture. */
  artCode: string;
}

/** Active categories in the server's order. */
export function homeCategories(list: readonly CategoryItem[] | null | undefined): HomeCategory[] {
  return [...(list ?? [])]
    .filter((category) => category.isActive !== false && !!category.code && !!category.name?.trim())
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name.trim(),
      artCode: REPRESENTATIVE_SERVICE[category.code] ?? category.code,
    }));
}
