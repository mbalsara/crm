/**
 * Theme Configuration
 *
 * This file provides easy theme customization for the CRM application.
 *
 * The app uses oklch colors (Lightness, Chroma, Hue):
 * - L (Lightness): 0-1 (0 = black, 1 = white)
 * - C (Chroma): 0-0.4 (0 = gray, higher = more saturated)
 * - H (Hue): 0-360 (color wheel position)
 *
 * Common hue values:
 * - 0-30: Red/Orange
 * - 30-90: Orange/Yellow
 * - 90-150: Yellow/Green
 * - 150-210: Green/Cyan
 * - 210-270: Cyan/Blue
 * - 270-330: Blue/Purple/Magenta
 * - 330-360: Magenta/Red
 */

export interface ThemeColors {
  /** Primary brand color - used for buttons, links, focus states */
  primary: { lightness: number; chroma: number; hue: number };
  /** Destructive/danger color - used for delete, errors */
  destructive: { lightness: number; chroma: number; hue: number };
  /** Success color - used for confirmations, positive states */
  success: { lightness: number; chroma: number; hue: number };
  /** Warning color - used for cautions, alerts */
  warning: { lightness: number; chroma: number; hue: number };
}

export interface ThemePreset {
  name: string;
  description: string;
  colors: ThemeColors;
}

/**
 * Theme Presets
 *
 * Add or modify these presets to create different brand themes.
 * The active theme can be set by updating globals.css with these values.
 */
export const themePresets: Record<string, ThemePreset> = {
  /** Default blue theme - professional and trustworthy */
  default: {
    name: "Default Blue",
    description: "A professional blue theme conveying trust and reliability",
    colors: {
      primary: { lightness: 0.55, chroma: 0.2, hue: 250 },
      destructive: { lightness: 0.55, chroma: 0.22, hue: 25 },
      success: { lightness: 0.65, chroma: 0.2, hue: 145 },
      warning: { lightness: 0.75, chroma: 0.18, hue: 80 },
    },
  },

  /** Indigo theme - modern and sophisticated */
  indigo: {
    name: "Indigo",
    description: "A modern indigo theme with a sophisticated feel",
    colors: {
      primary: { lightness: 0.55, chroma: 0.22, hue: 280 },
      destructive: { lightness: 0.55, chroma: 0.22, hue: 25 },
      success: { lightness: 0.65, chroma: 0.2, hue: 145 },
      warning: { lightness: 0.75, chroma: 0.18, hue: 80 },
    },
  },

  /** Teal theme - fresh and clean */
  teal: {
    name: "Teal",
    description: "A fresh teal theme perfect for modern apps",
    colors: {
      primary: { lightness: 0.55, chroma: 0.15, hue: 185 },
      destructive: { lightness: 0.55, chroma: 0.22, hue: 25 },
      success: { lightness: 0.65, chroma: 0.2, hue: 145 },
      warning: { lightness: 0.75, chroma: 0.18, hue: 80 },
    },
  },

  /** Green theme - natural and growth-oriented */
  green: {
    name: "Green",
    description: "A natural green theme suggesting growth and prosperity",
    colors: {
      primary: { lightness: 0.55, chroma: 0.18, hue: 145 },
      destructive: { lightness: 0.55, chroma: 0.22, hue: 25 },
      success: { lightness: 0.55, chroma: 0.15, hue: 185 },
      warning: { lightness: 0.75, chroma: 0.18, hue: 80 },
    },
  },

  /** Purple theme - creative and luxurious */
  purple: {
    name: "Purple",
    description: "A creative purple theme with a premium feel",
    colors: {
      primary: { lightness: 0.55, chroma: 0.2, hue: 300 },
      destructive: { lightness: 0.55, chroma: 0.22, hue: 25 },
      success: { lightness: 0.65, chroma: 0.2, hue: 145 },
      warning: { lightness: 0.75, chroma: 0.18, hue: 80 },
    },
  },

  /** Orange theme - energetic and friendly */
  orange: {
    name: "Orange",
    description: "An energetic orange theme that's warm and friendly",
    colors: {
      primary: { lightness: 0.6, chroma: 0.2, hue: 50 },
      destructive: { lightness: 0.55, chroma: 0.22, hue: 0 },
      success: { lightness: 0.65, chroma: 0.2, hue: 145 },
      warning: { lightness: 0.75, chroma: 0.18, hue: 80 },
    },
  },
};

/**
 * Generate CSS variables for a theme preset
 *
 * @param preset - Theme preset to generate CSS for
 * @returns CSS string with variable definitions
 *
 * @example
 * // To apply a theme, update these variables in globals.css:
 * const css = generateThemeCSS(themePresets.indigo);
 * console.log(css);
 */
export function generateThemeCSS(preset: ThemePreset): string {
  const { colors } = preset;

  // Light mode values
  const lightPrimary = `oklch(${colors.primary.lightness} ${colors.primary.chroma} ${colors.primary.hue})`;
  const lightDestructive = `oklch(${colors.destructive.lightness} ${colors.destructive.chroma} ${colors.destructive.hue})`;
  const lightSuccess = `oklch(${colors.success.lightness} ${colors.success.chroma} ${colors.success.hue})`;
  const lightWarning = `oklch(${colors.warning.lightness} ${colors.warning.chroma} ${colors.warning.hue})`;

  // Dark mode values (slightly lighter for better visibility)
  const darkPrimary = `oklch(${colors.primary.lightness + 0.1} ${colors.primary.chroma} ${colors.primary.hue})`;

  return `
/* ${preset.name} Theme - ${preset.description} */

/* Light Mode */
:root {
  --primary: ${lightPrimary};
  --primary-foreground: oklch(1 0 0);
  --destructive: ${lightDestructive};
  --success: ${lightSuccess};
  --warning: ${lightWarning};
  --ring: ${lightPrimary};
  --sidebar-primary: ${lightPrimary};
  --sidebar-ring: ${lightPrimary};
  --chart-1: ${lightPrimary};
}

/* Dark Mode */
.dark {
  --primary: ${darkPrimary};
  --primary-foreground: oklch(0.12 0 0);
  --ring: ${darkPrimary};
  --sidebar-primary: ${darkPrimary};
  --sidebar-ring: ${darkPrimary};
  --chart-1: ${darkPrimary};
}
`.trim();
}

/**
 * Active theme - change this to switch the entire app's theme
 *
 * To change the theme:
 * 1. Update this value to one of the preset keys
 * 2. Copy the output of generateThemeCSS() to your globals.css
 *
 * Or programmatically apply via CSS custom properties in JavaScript
 */
export const activeTheme = 'default';
