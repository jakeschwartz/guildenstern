/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        // Dark substrate (semantic names hold; ink = text, paper = surface)
        paper: "#131318",
        card: "#1C1C22",
        rule: "#2A2A30",
        ink: "#F2EFE6",
        muted: "#8A8780",
        // Page background — slightly darker than phone surface, so the phone pops
        page: "#0A0A0C",
        // State colors — brightened so they read on dark
        agent: "#4F9381",
        "agent-tint": "rgba(79, 147, 129, 0.14)",
        "agent-edge": "rgba(79, 147, 129, 0.55)",
        attention: "#D69B53",
        "attention-tint": "rgba(214, 155, 83, 0.14)",
        "attention-edge": "rgba(214, 155, 83, 0.55)",
        deliberation: "#7E93A3",
        "deliberation-tint": "rgba(126, 147, 163, 0.14)",
        "deliberation-edge": "rgba(126, 147, 163, 0.55)",
      },
    },
  },
  plugins: [],
};
