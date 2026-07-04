/**
 * Piri Design System v3 — "Atlas Arcade"
 * Hybride réseau social × vrai jeu mobile.
 * Photo-first élégant + couche jeu vibrante (chunky, or, progression).
 * Dark = riche (identité première) · Light = parchemin chaleureux.
 */
import { useColorScheme, TextStyle, ViewStyle } from "react-native";

// ─── Palette ──────────────────────────────────────────────
export const palette = {
  // Primary — grass (claim / CTA / succès)
  grass:       "#58B368",
  grassDark:   "#3E8E4E",
  grassLight:  "#79C687",
  grassSoft:   "#E3F4E6",

  // Back-compat aliases (ancienne palette corail → grass)
  coral:       "#58B368",
  coralDark:   "#3E8E4E",
  coralLight:  "#79C687",
  coralSoft:   "#E3F4E6",

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

  // Parchment — surfaces claires chaudes
  parchment:      "#F7F4ED",
  parchmentDeep:  "#EFEAE0",
  parchmentEdge:  "#E4DCCC",

  // Dark — surfaces sombres riches
  darkDeep:    "#0C1013",
  dark50:      "#11161A",
  dark100:     "#1A2126",
  dark200:     "#232C33",
  dark300:     "#2C363E",
  darkBorder:  "rgba(255,255,255,0.08)",

  // Game accents
  gold:        "#FFC94A", // Reis / valeur / territoire
  goldDark:    "#D9A32E",
  redstone:    "#E4614F", // danger / raid
  redstoneDark:"#C24B3C",
  redstoneDeep:"#8A453B", // bloqué
  diamond:     "#4CC3D9", // info / pulse
  diamondDark: "#35A0B5",
  diamondLight:"#82D7E6",
  amber:       "#FFA53E", // warning / fading
  amberDark:   "#DB872B",

  // Semantic
  success:     "#58B368",
  warning:     "#FFA53E",
  error:       "#E4614F",
  info:        "#4CC3D9",

  // Shields
  bronze:      "#CD7F32",
  silver:      "#C0C0C0",

  // Accent — or (récompenses, highlights)
  accent:      "#FFC94A",
  accentSoft:  "#FBEED0",
} as const;

// ─── Theme Tokens ─────────────────────────────────────────
export interface ThemeColors {
  // Surfaces
  bg:            string;
  bgSecondary:   string;
  bgTertiary:    string;
  card:          string;
  cardRaised:    string;
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
  tint:          string;

  // Accent (or)
  accent:        string;
  accentSoft:    string;

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
  scrim:         string;
}

const lightColors: ThemeColors = {
  bg:            palette.parchment,
  bgSecondary:   palette.parchmentDeep,
  bgTertiary:    palette.parchmentEdge,
  card:          palette.white,
  cardRaised:    palette.white,
  cardBorder:    palette.parchmentEdge,

  text:          palette.gray900,
  textSecondary: palette.gray600,
  textTertiary:  palette.gray400,
  textInverse:   palette.white,

  primary:       palette.grassDark,
  primarySoft:   palette.grassSoft,
  primaryText:   palette.white,
  tint:          palette.grassDark,

  accent:        palette.accent,
  accentSoft:    palette.accentSoft,

  success:       palette.success,
  warning:       palette.warning,
  error:         palette.error,

  border:        palette.parchmentEdge,
  separator:     palette.parchmentEdge,
  inputBg:       palette.white,
  inputBorder:   palette.parchmentEdge,
  tabBar:        palette.white,
  tabBarBorder:  "rgba(0,0,0,0.06)",
  overlay:       "rgba(17,22,26,0.5)",
  scrim:         "rgba(0,0,0,0.55)",
};

const darkColors: ThemeColors = {
  bg:            palette.dark50,
  bgSecondary:   palette.dark100,
  bgTertiary:    palette.dark200,
  card:          palette.dark100,
  cardRaised:    palette.dark200,
  cardBorder:    palette.dark200,

  text:          palette.gray100,
  textSecondary: palette.gray400,
  textTertiary:  palette.gray600,
  textInverse:   palette.black,

  primary:       palette.grass,
  primarySoft:   "rgba(88,179,104,0.16)",
  primaryText:   palette.white,
  tint:          palette.grass,

  accent:        palette.accent,
  accentSoft:    "rgba(255,201,74,0.15)",

  success:       palette.success,
  warning:       palette.warning,
  error:         palette.error,

  border:        palette.darkBorder,
  separator:     palette.dark300,
  inputBg:       palette.dark100,
  inputBorder:   palette.dark300,
  tabBar:        palette.dark100,
  tabBarBorder:  palette.darkBorder,
  overlay:       "rgba(0,0,0,0.65)",
  scrim:         "rgba(0,0,0,0.55)",
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
  // iOS: SF Pro. Android: Roboto. System fonts = feel natif propre.
  sizes: {
    xs:    11,
    sm:    13,
    base:  15,
    md:    17,
    lg:    20,
    xl:    24,
    xxl:   28,
    hero:  32,
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
  letterSpacing: {
    tight:  -0.4,
    normal: 0,
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
  xxl:  28,
  full: 9999,
} as const;

// ─── Edges (tranche 3D-soft des boutons de jeu) ───────────
export const edges = {
  button: 4,
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
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  } as ViewStyle,
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 7,
  } as ViewStyle,
} as const;
