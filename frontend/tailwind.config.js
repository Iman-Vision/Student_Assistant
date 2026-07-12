/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#ffffff",
        "foreground-muted": "#a0a0a0",
        border: "#2a2a2a",
        card: "#1a1a1a",
        "card-secondary": "#141414",
        accent: "#8b5cf6",
        "accent-secondary": "#6366f1",
      }
    },
  },
  plugins: [],
}