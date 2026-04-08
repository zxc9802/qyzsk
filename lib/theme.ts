export type ThemeMode = "dark" | "light";

export const DEFAULT_THEME_MODE: ThemeMode = "light";

export function isThemeMode(value: string): value is ThemeMode {
  return value === "dark" || value === "light";
}
