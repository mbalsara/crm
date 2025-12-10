import * as React from 'react';
import { themePresets, type ThemePreset } from '@/lib/theme-config';

/**
 * Hook to programmatically change theme colors
 *
 * @example
 * ```tsx
 * const { applyPreset, setPrimaryHue, presets } = useThemeColors();
 *
 * // Apply a preset theme
 * applyPreset('indigo');
 *
 * // Or just change the primary color hue
 * setPrimaryHue(300); // Purple
 * ```
 */
export function useThemeColors() {
  /**
   * Apply a theme preset by name
   */
  const applyPreset = React.useCallback((presetName: keyof typeof themePresets) => {
    const preset = themePresets[presetName];
    if (!preset) {
      console.warn(`Theme preset "${presetName}" not found`);
      return;
    }

    const root = document.documentElement;
    const { colors } = preset;

    // Light mode values
    const lightPrimary = `oklch(${colors.primary.lightness} ${colors.primary.chroma} ${colors.primary.hue})`;
    const darkPrimary = `oklch(${colors.primary.lightness + 0.1} ${colors.primary.chroma} ${colors.primary.hue})`;

    // Apply to CSS variables
    root.style.setProperty('--primary', lightPrimary);
    root.style.setProperty('--ring', lightPrimary);
    root.style.setProperty('--sidebar-primary', lightPrimary);
    root.style.setProperty('--sidebar-ring', lightPrimary);
    root.style.setProperty('--chart-1', lightPrimary);

    // Also update for dark mode if currently in dark mode
    if (root.classList.contains('dark')) {
      root.style.setProperty('--primary', darkPrimary);
      root.style.setProperty('--ring', darkPrimary);
      root.style.setProperty('--sidebar-primary', darkPrimary);
      root.style.setProperty('--sidebar-ring', darkPrimary);
      root.style.setProperty('--chart-1', darkPrimary);
    }
  }, []);

  /**
   * Set just the primary color hue (0-360)
   */
  const setPrimaryHue = React.useCallback((hue: number) => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');

    const lightness = isDark ? 0.65 : 0.55;
    const primary = `oklch(${lightness} 0.2 ${hue})`;

    root.style.setProperty('--primary', primary);
    root.style.setProperty('--ring', primary);
    root.style.setProperty('--sidebar-primary', primary);
    root.style.setProperty('--sidebar-ring', primary);
    root.style.setProperty('--chart-1', primary);
  }, []);

  /**
   * Reset to default theme (removes custom properties)
   */
  const resetToDefault = React.useCallback(() => {
    const root = document.documentElement;
    const properties = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring', '--chart-1'];
    properties.forEach((prop) => root.style.removeProperty(prop));
  }, []);

  return {
    presets: themePresets,
    applyPreset,
    setPrimaryHue,
    resetToDefault,
  };
}
