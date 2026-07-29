// Jokoo design tokens — imposed palette + Poppins.
export const colors = {
  // brand
  midnight: "#0B1F3A",
  turquoise: "#00C2A8",
  white: "#FFFFFF",
  // surfaces
  surface: "#FFFFFF",
  surface2: "#F7F9FC",
  surface3: "#EAF0F8",
  brandTertiary: "#E0F8F5",
  // text
  text: "#0B1F3A",
  textMuted: "#5A6A85",
  textSubtle: "#8A97AE",
  // system
  border: "#E5EAF2",
  borderStrong: "#CCD6E5",
  divider: "#F0F4F8",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#0EA5E9",
  // gradients
  overlay: "rgba(11,31,58,0.55)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  soft: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  strong: {
    shadowColor: "#0B1F3A",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

// Font families are only used if Poppins has been loaded; otherwise falls back to system.
export const font = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
};

export const fs = {
  xxs: 11,
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 34,
};
