/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        serif: [
          "ui-serif",
          '"Iowan Old Style"',
          '"Apple Garamond"',
          "Georgia",
          "serif",
        ],
      },
      colors: {
        // Canvas / structural tokens are CSS variables so theme can toggle.
        paper: "var(--paper)",
        page: "var(--page)",
        card: "var(--card)",
        rule: "var(--rule)",
        ink: "var(--ink)",
        muted: "var(--muted)",

        // Voices
        mira: "var(--mira)",
        "mira-tint": "var(--mira-tint)",
        otis: "var(--otis)",
        "otis-tint": "var(--otis-tint)",
        specialist: "var(--specialist)",
        "specialist-tint": "var(--specialist-tint)",

        // States
        attention: "var(--attention)",
        "attention-tint": "var(--attention-tint)",

        // Canvases
        "spoke-canvas": "var(--spoke-canvas)",
        "warm-paper": "var(--warm-paper)",
      },
      borderRadius: {
        squircle: "10px",
      },
    },
  },
  plugins: [],
};
