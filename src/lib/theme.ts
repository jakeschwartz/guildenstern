// Theme toggle. Dark is the default canvas. Persists via localStorage.

const KEY = "guildenstern-theme";

export type Theme = "dark" | "light";

export const getTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(KEY);
  return stored === "light" ? "light" : "dark";
};

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
  window.localStorage.setItem(KEY, theme);
};

export const toggleTheme = (): Theme => {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
};

// Call once at app boot, before first paint if possible.
export const initTheme = () => {
  applyTheme(getTheme());
};
