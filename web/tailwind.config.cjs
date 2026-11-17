/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{tsx,ts}",
    "./web/src/**/*.{tsx,ts}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--ds-color-bg, #f3f2ee)",
        surface: "var(--ds-color-surface, #ebeae5)",
        panel: "var(--ds-color-panel, #faf9f6)",
        text: "var(--ds-color-text, #090a0d)",
        textSoft: "var(--ds-color-text-soft, #32343b)",
        textMuted: "var(--ds-color-text-muted, #70727a)",
        border: "var(--ds-color-border, rgba(9,10,13,.15))",
        borderSoft: "var(--ds-color-border-soft, rgba(9,10,13,.08))",
        action: "var(--ds-color-action, #08090b)",
        onAction: "var(--ds-color-on-action, #fff)",
        focus: "var(--ds-color-focus, var(--ds-brand-indigo))",
        violet: "var(--ds-brand-violet, #7938fb)",
        indigo: "var(--ds-brand-indigo, #666dfb)",
        cyan: "var(--ds-brand-cyan, #49c9f4)",
        mint: "var(--ds-brand-mint, #66f3ac)",
      },
      fontFamily: {
        body: ["Manrope", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        heading: ["Nunito Sans", "ui-sans-serif", "sans-serif"],
        display: ["Nunito Sans", "ui-sans-serif", "sans-serif"],
        sans: ["Manrope", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        "20": "80px",
        "24": "96px",
        "32": "128px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        pill: "999px",
      },
      keyframes: {
        "dashboardMetricLoading": {
          "0%": { "background-position": "0 0" },
          "100%": { "background-position": "-220% 0" },
        },
        "liquidityGaugePulse": {
          "0%": { "box-shadow": "0 0 0 0 color-mix(in srgb,var(--ds-brand-mint) 4%,transparent)" },
          "50%": { "box-shadow": "0 0 0 7px color-mix(in srgb,var(--ds-brand-mint) 4%,transparent)" },
          "100%": { "box-shadow": "0 0 0 0 color-mix(in srgb,var(--ds-brand-mint) 4%,transparent)" },
        },
      },
      animation: {
        "dashboardMetricLoading": "dashboardMetricLoading 1.15s ease-in-out infinite",
        "liquidityGaugePulse": "liquidityGaugePulse 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};