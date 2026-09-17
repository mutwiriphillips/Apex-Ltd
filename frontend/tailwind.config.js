/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        kenya: {
          black: "#000000",
          red: "#BB0000",
          green: "#006600",
          white: "#FFFFFF",
          gold: "#C89B3C",
        },
        // Back-compat alias used by earlier components.
        embu: {
          green: "#006600",
          gold: "#C89B3C",
        },
      },
      backgroundImage: {
        "kenya-stripe": "linear-gradient(90deg, #000000 0%, #000000 33%, #BB0000 33%, #BB0000 66%, #006600 66%, #006600 100%)",
      },
    },
  },
  plugins: [],
};
