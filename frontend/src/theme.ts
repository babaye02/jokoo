// Jokoo Design System v2 — "iOS-Native Clean × Glass/Luxe"
// Inspirations : Airbnb, Apple, Notion, Revolut, Pinterest
// African premium marketplace — luminous, editorial, aspirational.
//
// RÈGLES CRITIQUES :
// - Fond primaire = BLANC pur (`surface`) pour un rendu lumineux moderne
// - Fond secondaire = BEIGE très léger (`surfaceWarm`) pour sections éditoriales chaleureuses
// - Texte principal = NOIR PROFOND (`text`) pour lisibilité maximale
// - Rayons généreux (24pt+) sur cartes principales
// - Ombres tier 1 subtiles uniquement (jamais boxy)
// - Toute photo avec texte overlay DOIT avoir un scrim gradient

export const colors = {
  // ---------- Brand (conservé) ----------
  midnight: "#0B1F3A",
  midnightDark: "#061426",
  turquoise: "#00C2A8",
  turquoiseLight: "#4CD9C4",
  turquoiseDark: "#007A6A",
  brandTertiary: "#E6FAF7",

  // ---------- Surfaces ----------
  white: "#FFFFFF",
  surface: "#FFFFFF",          // fond primaire — max de blancs
  surface2: "#FAFAF8",         // fond secondaire ultra-léger (transitions douces)
  surfaceWarm: "#FDFBF7",      // beige chaleureux — sections éditoriales / hero
  surfaceWarm2: "#F5F1EA",     // beige plus marqué — appels d'accent
  surfaceDark: "#0B1F3A",      // navy pour hero sombres
  surfaceInverse: "#0B1F3A",

  // ---------- Text (Airbnb-style hierarchy) ----------
  text: "#1A1A1A",             // Noir profond — H1, corps principal
  textSecondary: "#484848",    // Gris foncé — H2, corps secondaire
  textMuted: "#717171",        // Gris moyen — labels, méta
  textSubtle: "#B0B0B0",       // Gris clair — placeholders, disabled
  textInverse: "#FFFFFF",

  // ---------- Borders / Dividers ----------
  border: "#EBE8E3",           // beige subtile
  borderStrong: "#D1CCC2",
  divider: "#F0EEE9",
  hairline: "rgba(0,0,0,0.06)",

  // ---------- System ----------
  success: "#00C2A8",          // aligne sur brand turquoise
  successBg: "#E6FAF7",
  warning: "#F5A623",
  warningBg: "#FFF4E0",
  danger: "#E11D48",           // Rose-rouge éditorial (moins agressif que rouge pur)
  dangerBg: "#FFE4E6",
  info: "#3B82F6",
  infoBg: "#EFF6FF",

  // ---------- Overlays (pour scrims photos) ----------
  scrimDark: "rgba(11,31,58,0.75)",       // scrim gradient bas
  scrimDarkTop: "rgba(11,31,58,0.35)",    // scrim gradient haut léger
  scrimMedium: "rgba(11,31,58,0.55)",
  scrimBlack: "rgba(0,0,0,0.7)",
  glass: "rgba(255,255,255,0.72)",         // fond glassmorphism blanc
  glassDark: "rgba(11,31,58,0.55)",        // fond glassmorphism sombre

  // ---------- Legacy aliases (retro-compat) ----------
  surface3: "#EAF0F8",         // ancien token — utilisé dans certains composants
  subtext: "#717171",          // ancien alias de textMuted
  overlay: "rgba(11,31,58,0.55)",
};

// ---------- Spacing (8pt grid + generous breathing room) ----------
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
};

// ---------- Radius (Airbnb-inspired — very rounded) ----------
export const radius = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,           // Cartes principales
  xl: 32,           // Hero cards, sheets
  xxl: 40,          // Cartes vedettes catégorie
  pill: 999,
};

// ---------- Shadows (subtle tier 1 — jamais boxy) ----------
export const shadow = {
  hairline: {
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  soft: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  card: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  elevated: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  hero: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.22,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 14,
  },
  // Legacy alias
  strong: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

// ---------- Typography (Poppins conservé, hiérarchie éditoriale moderne) ----------
export const font = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extrabold: "Poppins_800ExtraBold",
};

// Échelle typographique (Airbnb/Apple-style)
export const fs = {
  xxs: 11,
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 40,
  displayLg: 52,
};

// Hiérarchie éditoriale prête à l'emploi (à utiliser dans <Txt variant="...">)
export const typo = {
  displayXL:  { fontSize: 52, lineHeight: 56, letterSpacing: -1.2, fontFamily: font.extrabold, color: colors.text },
  display:    { fontSize: 40, lineHeight: 44, letterSpacing: -0.8, fontFamily: font.extrabold, color: colors.text },
  h1:         { fontSize: 30, lineHeight: 36, letterSpacing: -0.5, fontFamily: font.bold,      color: colors.text },
  h2:         { fontSize: 24, lineHeight: 30, letterSpacing: -0.3, fontFamily: font.bold,      color: colors.text },
  h3:         { fontSize: 20, lineHeight: 26, letterSpacing: -0.2, fontFamily: font.semibold,  color: colors.text },
  title:      { fontSize: 17, lineHeight: 24, letterSpacing: -0.1, fontFamily: font.semibold,  color: colors.text },
  body:       { fontSize: 15, lineHeight: 22, fontFamily: font.regular,  color: colors.textSecondary },
  bodyBold:   { fontSize: 15, lineHeight: 22, fontFamily: font.semibold, color: colors.text },
  caption:    { fontSize: 13, lineHeight: 18, fontFamily: font.regular,  color: colors.textMuted },
  captionBold:{ fontSize: 13, lineHeight: 18, fontFamily: font.semibold, color: colors.text },
  overline:   { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontFamily: font.bold, color: colors.textMuted, textTransform: "uppercase" as const },
  micro:      { fontSize: 11, lineHeight: 14, fontFamily: font.medium, color: colors.textMuted },
};

// ---------- Motion (animations & timing) ----------
export const motion = {
  duration: {
    fast: 150,
    base: 220,
    slow: 320,
    slower: 480,
  },
  easing: {
    // Utilisez avec Easing.bezier(...) dans reanimated
    standard: [0.4, 0.0, 0.2, 1] as const,      // material standard
    emphasized: [0.2, 0.0, 0, 1] as const,       // apple ease-out
    spring: [0.34, 1.56, 0.64, 1] as const,      // slight overshoot
  },
};

// ---------- Glass effect config ----------
export const glass = {
  intensityIOS: 90,           // expo-blur intensity iOS
  intensityAndroid: 60,       // Android is heavier — reduce
  tintBase: "rgba(255,255,255,0.72)",   // fallback tint for readability
  tintDark: "rgba(11,31,58,0.55)",
};
