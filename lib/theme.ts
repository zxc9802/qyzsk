export type ThemeMode = "dark" | "light";

export const DEFAULT_THEME_MODE: ThemeMode = "dark";

export function isThemeMode(value: string): value is ThemeMode {
  return value === "dark" || value === "light";
}
