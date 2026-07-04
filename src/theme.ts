/**
 * Tessra Design System — "Minecraft-soft"
 * Terre, herbe, or : conquête de territoire, sobre et élégant.
 * Dark = deepslate (identité première) · Light = parchemin.
 */
import { useColorScheme, StyleSheet, TextStyle, ViewStyle } from "react-native";

// ─── Palette ──────────────────────────────────────────────
export const palette = {
  // Primary — grass (claim / CTA / succès)
  grass:       "#6FA860",
  grassDark:   "#5C8F50",
  grassLight:  "#83B675",
  grassSoft:   "#EAF1E4",

  // Back-compat aliases (ancienne palette corail → grass)
  coral:       "#6FA860",
  coralDark:   "#5C8F50",
  coralLight:  "#83B675",
  coralSoft:   "#EAF1E4",

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
  parchment:      "#F4F1EA",
  parchmentDeep:  "#EDE9DF",
  parchmentEdge:  "#E3DDD0",

  // Deepslate — surfaces sombres
  dark50:      "#131619",
  dark100:     "#1A1E22",
  dark200:     "#20262B",
  dark300:     "#2A3138",
  darkBorder:  "#2E353C",
  darkDeep:    "#0F1214",

  // Game accents
  gold:        "#F2B441", // Reis / valeur / territoire
  goldDark:    "#CE9226",
  redstone:    "#C25B52", // danger / raid
  redstoneDark:"#AD4B42",
  redstoneDeep:"#7A4A45", // bloqué
  diamond:     "#5FB3BE", // info / pulse
  diamondDark: "#3F96A2",
  diamondLight:"#8CCAD3",
  amber:       "#E8973A", // warning / fading
  amberDark:   "#C97F2A",

  // Semantic
  success:     "#6FA860",
  warning:     "#E8973A",
  error:       "#C25B52",
  info:        "#5FB3BE",

  // Shields
  bronze:      "#CD7F32",
  silver:      "#C0C0C0",

  // Accent — or adouci (récompenses, highlights)
  accent:      "#F2B441",
  accentSoft:  "#F8ECD4",
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
}

const lightColors: ThemeColors = {
  bg:            palette.parchment,
  bgSecondary:   palette.parchmentDeep,
  bgTertiary:    palette.parchmentEdge,
  card:          palette.white,
  cardBorder:    palette.parchmentEdge,

  text:          palette.gray900,
  textSecondary: palette.gray600,
  textTertiary:  palette.gray400,
  textInverse:   palette.white,

  primary:       palette.grassDark,
  primarySoft:   palette.grassSoft,
  primaryText:   palette.white,

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
  overlay:       "rgba(19,22,25,0.5)",
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

  primary:       palette.grass,
  primarySoft:   "rgba(111,168,96,0.16)",
  primaryText:   palette.white,

  accent:        palette.accent,
  accentSoft:    "rgba(242,180,65,0.15)",

  success:       palette.success,
  warning:       palette.warning,
  error:         palette.error,

  border:        palette.darkBorder,
  separator:     palette.dark300,
  inputBg:       palette.dark100,
  inputBorder:   palette.dark300,
  tabBar:        palette.darkDeep,
  tabBarBorder:  "rgba(255,255,255,0.06)",
  overlay:       "rgba(0,0,0,0.65)",
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
  md:   14,
  lg:   20,
  xl:   24,
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
