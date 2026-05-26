module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Montserrat", "Segoe UI", "Arial", "sans-serif"]
      },
      colors: {
        steel: {
          950: "#071426",
          900: "#0a2448",
          850: "#123765",
          800: "#164985",
          700: "#245e9e",
          500: "#647fa8"
        },
        safety: {
          500: "#f4c430",
          600: "#e0a912"
        }
      }
    }
  },
  plugins: []
};
