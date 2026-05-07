/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
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
