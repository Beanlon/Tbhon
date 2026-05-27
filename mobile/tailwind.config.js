/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        /** TBhon screening / primary actions — matches legacy `#0B1530` */
        navy: "#0B1530",
        /** App-wide screen background — matches `palette.lavender` */
        lavender: "#EAE8FA",
      },
      // Mobile-first: default = small phones; these fire at min logical width (see NativeWind docs).
      screens: {
        sm: "390px",
        md: "600px",
        lg: "768px",
      },
    },
  },
  plugins: [],
};
