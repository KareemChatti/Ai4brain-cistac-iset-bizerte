/** @type {import('tailwindcss').Config} */
// Every colour, face, radius and shadow is a token from src/tokens.css (Hum).
const token = (name) => `var(--${name})`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: token("color-paper"), 2: token("color-paper-2"), 3: token("color-paper-3") },
        ink: { DEFAULT: token("color-ink"), 2: token("color-ink-2") },
        muted: token("color-muted"),
        rule: token("color-rule"),
        accent: { DEFAULT: token("color-accent"), deep: token("color-accent-deep"), ink: token("color-accent-ink") },
        link: token("color-accent-2"),
        coral: token("color-accent-3"),
        mint: { DEFAULT: token("color-mint"), deep: token("color-mint-deep") },
        focus: token("color-focus"),
        card: token("color-card"),
        edge: token("color-edge"),
        mat: { DEFAULT: token("color-mat"), 2: token("color-mat-2"), ink: token("color-mat-ink") },
        error: token("color-error"),
        success: token("color-success"),
        "suit-red": token("color-suit-red"),
      },
      fontFamily: { display: token("font-display"), body: token("font-body") },
      borderRadius: { card: token("radius-card"), stock: token("radius-stock"), input: token("radius-input") },
      boxShadow: { card: token("shadow-card") },
      maxWidth: { app: token("container-app") },
      fontSize: { base: ["1.0625rem", "1.6rem"], page: [token("text-page"), "1.1"], figure: [token("text-figure"), "1"] },
    },
  },
  plugins: [],
};
