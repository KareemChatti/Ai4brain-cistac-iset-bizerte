/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#1E5DA8", light: "#E8F0FA", dark: "#164680" },
      },
      fontSize: { base: ["1.0625rem", "1.6rem"] },
    },
  },
  plugins: [],
};
