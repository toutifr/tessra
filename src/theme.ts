/**
 * Tessra Design System
 * Palette: blanc + corail — dark/light auto
 */
import { useColorScheme, StyleSheet, TextStyle, ViewStyle } from "react-native";

// ─── Palette ──────────────────────────────────────────────
export const palette = {
  // Primary — warm corail
  coral:       "#FF6B6B",
  coralDark:   "#E85555",
  coralLight:  "#FF8A8A",
  coralSoft:   "#FFF0F0",

  // Neutral
  white:       "#FFFFFF",
  gray50:      "#FAFAFA",
  gray100:     "#F5F5F5",
  gray200:     "#EEEEEE",
  gray300:     "#E0E0E0",
  gray400:     "#BDBDBD",
  gray500:     "#9E9E9E",
  gray600:     "#757575",
  gray700:     "#616161",
  gray800:     "#424242",
  gray900:     "#212121",
  black:       "#111111",

  // Dark mode surfaces
  dark50:      "#1C1C1E",
  dark100:     "#2C2C2E",
  dark200:     "#3A3A3C",
  dark300:     "#48484A",

  // Semantic
  success:     "#34C759",
  warning:     "#FF9500",
  error:       "#FF3B30",
  info:        "#5AC8FA",

  // Shields
  bronze:      "#CD7F32",
  silver:      "#C0C0C0",
  gold:        "#FFD700",
} as const;

// ─── Theme Tokens ─────────────────────────────────────────
export interface ThemeColors {
  // Surfaces
  bg:            string;
  bgSecondary:   string;
  bgTertiary:    string;
  card:          string;
  cardBorder:    string;

  // Text
  text:          string;
  textSecondary: string;
  textTertiary:  string;
  textInverse:   string;

  // Primary
  primary:       string;
  primarySoft:   string;
  primaryText:   string;

  // Semantic
  success:       string;
  warning:       string;
  error:         string;

  // Interactive
  border:        string;
  separator:     string;
  inputBg:       string;
  inputBorder:   string;
  tabBar:        string;
  tabBarBorder:  string;
  overlay:       string;
}

const lightColors: ThemeColors = {
  bg:            palette.white,
  bgSecondary:   palette.gray50,
  bgTertiary:    palette.gray100,
  card:          palette.white,
  cardBorder:    palette.gray200,

  text:          palette.gray900,
  textSecondary: palette.gray600,
  textTertiary:  palette.gray400,
  textInverse:   palette.white,

  primary:       palette.coral,
  primarySoft:   palette.coralSoft,
  primaryText:   palette.white,

  success:       palette.success,
  warning:       palette.warning,
  error:         palette.error,

  border:        palette.gray200,
  separator:     palette.gray200,
  inputBg:       palette.gray50,
  inputBorder:   palette.gray300,
  tabBar:        palette.white,
  tabBarBorder:  "rgba(0,0,0,0.06)",
  overlay:       "rgba(0,0,0,0.4)",
};

const darkColors: ThemeColors = {
  bg:            palette.dark50,
  bgSecondary:   palette.dark100,
  bgTertiary:    palette.dark200,
  card:          palette.dark100,
  cardBorder:    palette.dark200,

  text:          palette.gray100,
  textSecondary: palette.gray400,
  textTertiary:  palette.gray600,
  textInverse:   palette.black,

  primary:       palette.coralLight,
  primarySoft:   "rgba(255,107,107,0.15)",
  primaryText:   palette.white,

  success:       palette.success,
  warning:       palette.warning,
  error:         palette.error,

  border:        palette.dark200,
  separator:     palette.dark200,
  inputBg:       palette.dark100,
  inputBorder:   palette.dark300,
  tabBar:        palette.dark50,
  tabBarBorder:  "rgba(255,255,255,0.06)",
  overlay:       "rgba(0,0,0,0.6)",
};

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

// ─── Typography ───────────────────────────────────────────
export const fonts = {
  // iOS: SF Pro is default. Android: Roboto is default.
  // We rely on system fonts for clean native feel.
  sizes: {
    xs:    11,
    sm:    13,
    base:  15,
    md:    17,
    lg:    20,
    xl:    24,
    xxl:   28,
    xxxl:  34,
  },
  weights: {
    regular: "400" as TextStyle["fontWeight"],
    medium:  "500" as TextStyle["fontWeight"],
    semibold: "600" as TextStyle["fontWeight"],
    bold:    "700" as TextStyle["fontWeight"],
    heavy:   "800" as TextStyle["fontWeight"],
  },
  lineHeights: {
    tight:   1.2,
    normal:  1.4,
    relaxed: 1.6,
  },
} as const;

// ─── Spacing ──────────────────────────────────────────────
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  base: 16,
  lg:  20,
  xl:  24,
  xxl: 32,
  xxxl: 40,
} as const;

// ─── Radii ────────────────────────────────────────────────
export const radii = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 9999,
} as const;

// ─── Shadows ──────────────────────────────────────────────
export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  } as ViewStyle,
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  } as ViewStyle,
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  } as ViewStyle,
} as const;
