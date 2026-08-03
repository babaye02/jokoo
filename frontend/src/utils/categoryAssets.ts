// Registre des assets images pour les catégories de services.
// Photos IA générées par Gemini Nano Banana — scènes Sénégal authentiques.
// Utilisation :
//   import { CATEGORY_PHOTOS } from "@/src/utils/categoryAssets";
//   <Image source={CATEGORY_PHOTOS.beauty} />
export const CATEGORY_PHOTOS: Record<string, any> = {
  beauty: require("@/assets/categories/beauty.png"),
  health: require("@/assets/categories/health.png"),
  home: require("@/assets/categories/home.png"),
  repair: require("@/assets/categories/repair.png"),
  transport: require("@/assets/categories/transport.png"),
  food: require("@/assets/categories/food.png"),
  events: require("@/assets/categories/events.png"),
  tech: require("@/assets/categories/tech.png"),
  education: require("@/assets/categories/education.png"),
  kids: require("@/assets/categories/kids.png"),
  laundry: require("@/assets/categories/laundry.png"),
  moving: require("@/assets/categories/moving.png"),
};

// Fallback photo générique (utilise "moving" comme fallback élégant)
export const CATEGORY_FALLBACK = CATEGORY_PHOTOS.moving;

export function getCategoryPhoto(key: string) {
  return CATEGORY_PHOTOS[key] || CATEGORY_FALLBACK;
}

// Icônes Ionicons signature par catégorie (superposées sur les photos hero).
export const CATEGORY_ICONS: Record<string, string> = {
  beauty: "sparkles",
  health: "medkit",
  home: "home",
  repair: "hammer",
  transport: "car-sport",
  food: "restaurant",
  events: "sparkles",
  tech: "laptop",
  education: "book",
  kids: "happy",
  laundry: "shirt",
  moving: "cube",
  garden: "leaf",
  errands: "cart",
  admin: "document-text",
  creative: "camera",
  rental: "cube-outline",
  pets: "paw",
  security: "shield-checkmark",
  other: "grid",
};

export function getCategoryIcon(key: string): string {
  return CATEGORY_ICONS[key] || "grid";
}
