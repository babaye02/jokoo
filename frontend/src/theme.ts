// Jokoo Design System v3 — "Apple × Airbnb × Aesop × Afrique contemporaine"
// Refonte totale : palette restreinte, typographie éditoriale, espacement luxe, minimalisme.
//
// PRINCIPES :
// - PALETTE RESTREINTE : 6 couleurs seulement, une raison d'exister pour chacune
// - RESPIRATION : espacement généreux, jamais serré
// - TYPOGRAPHIE : Instrument Serif (titres) + Système/Inter (texte)
// - MINIMALISME : ombres imperceptibles, dégradés subtils
// - INTEMPORALITÉ : aucune couleur "arc-en-ciel"

export const colors = {
  // ============ PALETTE PRINCIPALE (6 couleurs uniquement) ============
  bg: "#FAF9F7",              // Fond primaire — beige off-white premium (Aesop-like)
  card: "#FFFFFF",            // Fond cartes — blanc pur
  text: "#1F1F1F",            // Texte principal — noir profond doux (pas #000 austère)
  primary: "#18C6A3",         // Turquoise brand — plus vif que l'ancien
  accent: "#FF8C7A",          // Corail chaleureux — accent unique
  success: "#3CB371",         // Vert médium — succès

  // ============ Aliases utilitaires ============
  white: "#FFFFFF",
  black: "#000000",

  // Text hierarchy dérivée de #1F1F1F
  textSecondary: "#4A4A4A",   // Sous-titres, body secondaire
  textMuted: "#7A7A7A",       // Meta, labels
  textSubtle: "#B5B5B5",      // Placeholders, disabled
  textInverse: "#FFFFFF",

  // Surfaces dérivées
  surface: "#FFFFFF",         // = card (alias)
  surface2: "#FAF9F7",        // = bg (alias)
  surfaceWarm: "#F5F3EE",     // Beige plus marqué pour sections éditoriales
  surface3: "#EFEDE7",        // Encore plus marqué

  // ============ Legacy brand (compat) ============
  midnight: "#1F1F1F",        // ancien navy → maintenant text principal
  midnightDark: "#000000",
  turquoise: "#18C6A3",       // = primary
  turquoiseLight: "#4CD9C4",
  turquoiseDark: "#0E9982",
  brandTertiary: "#E6F9F4",   // primary/10

  // Borders — hairline discret sur beige
  border: "#EAE7E1",
  borderStrong: "#D6D2CA",
  divider: "#EDEAE4",
  hairline: "rgba(31,31,31,0.06)",

  // System states (minimal)
  successBg: "#E6F5EC",
  warning: "#E8A94A",
  warningBg: "#FCF3E4",
  danger: "#D95555",
  dangerBg: "#FBEAE9",
  info: "#5B8DEF",
  infoBg: "#EBF1FD",

  // Scrims & overlays (pour photos)
  scrimDark: "rgba(31,31,31,0.72)",
  scrimDarkTop: "rgba(31,31,31,0.30)",
  scrimMedium: "rgba(31,31,31,0.50)",
  scrimBlack: "rgba(0,0,0,0.65)",

  // Glassmorphism
  glass: "rgba(255,255,255,0.72)",
  glassDark: "rgba(31,31,31,0.55)",

  // Legacy compat
  subtext: "#7A7A7A",
  overlay: "rgba(31,31,31,0.55)",
  surfaceInverse: "#1F1F1F",
  surfaceDark: "#1F1F1F",
  surfaceWarm2: "#EFEDE7",
};

// ============ Spacing — respirations généreuses (base 8, très aérée) ============
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 14,      // 12 → 14
  lg: 20,      // 16 → 20 (plus d'air)
  xl: 28,      // 24 → 28
  xxl: 40,     // 32 → 40
  xxxl: 56,    // 48 → 56 (sections)
  huge: 80,    // 64 → 80 (hero breathing)
};

// ============ Radius — Apple/Airbnb style (généreux) ============
export const radius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,           // Cartes principales
  xl: 32,           // Hero cards, sheets
  xxl: 44,          // Cartes vedettes très arrondies
  pill: 999,
};

// ============ Shadows — très discrètes (pas d'ombres marquées) ============
export const shadow = {
  hairline: {
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  card: {
    shadowColor: "#1F1F1F",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  elevated: {
    shadowColor: "#1F1F1F",
    shadowOpacity: 0.10,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  hero: {
    shadowColor: "#1F1F1F",
    shadowOpacity: 0.16,
    shadowRadius: 44,
    shadowOffset: { width: 0, height: 22 },
    elevation: 14,
  },
  strong: {
    shadowColor: "#1F1F1F",
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};

// ============ Typography ============
// Titres : Instrument Serif (chargée dynamiquement via expo-font)
// Body : SF Pro / System / Inter (system defaults selon plateforme)
export const font = {
  // Serif éditorial pour titres
  serif: "InstrumentSerif",
  serifItalic: "InstrumentSerifItalic",

  // Système (fallback natif = SF Pro iOS / Roboto Android)
  regular: "System",
  medium: "System",
  semibold: "System",
  bold: "System",
  extrabold: "System",
};

// Échelle typographique — beaucoup d'air
export const fs = {
  xxs: 11,
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 32,
  display: 44,
  displayLg: 56,
};

// Hiérarchie prête à l'emploi
export const typo = {
  // Titres éditoriaux (Instrument Serif)
  displayXL: { fontFamily: font.serif, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: colors.text },
  display:   { fontFamily: font.serif, fontSize: 44, lineHeight: 48, letterSpacing: -1.2, color: colors.text },
  h1:        { fontFamily: font.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: colors.text },
  h2:        { fontFamily: font.serif, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: colors.text },
  h3:        { fontFamily: font.serif, fontSize: 22, lineHeight: 28, letterSpacing: -0.2, color: colors.text },

  // Textes système (SF Pro / Inter)
  title:      { fontSize: 17, lineHeight: 24, fontWeight: "600" as const, letterSpacing: -0.1, color: colors.text },
  titleBold:  { fontSize: 17, lineHeight: 24, fontWeight: "700" as const, letterSpacing: -0.1, color: colors.text },
  body:       { fontSize: 15, lineHeight: 24, fontWeight: "400" as const, color: colors.textSecondary },
  bodyBold:   { fontSize: 15, lineHeight: 24, fontWeight: "600" as const, color: colors.text },
  caption:    { fontSize: 13, lineHeight: 20, fontWeight: "400" as const, color: colors.textMuted },
  captionBold:{ fontSize: 13, lineHeight: 20, fontWeight: "600" as const, color: colors.text },
  overline:   { fontSize: 11, lineHeight: 14, letterSpacing: 1.6, fontWeight: "600" as const, color: colors.textMuted, textTransform: "uppercase" as const },
  micro:      { fontSize: 11, lineHeight: 14, fontWeight: "500" as const, color: colors.textMuted },
};

// ============ Motion — timing courbes Apple ============
export const motion = {
  duration: { fast: 150, base: 240, slow: 360, slower: 520 },
  easing: {
    standard:   [0.4, 0.0, 0.2, 1] as const,
    emphasized: [0.2, 0.0, 0, 1] as const,
    spring:     [0.34, 1.56, 0.64, 1] as const,
  },
};

// Glass
export const glass = {
  intensityIOS: 80,
  intensityAndroid: 55,
  tintBase: "rgba(255,255,255,0.75)",
  tintDark: "rgba(31,31,31,0.55)",
};
