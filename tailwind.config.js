module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Arial", "sans-serif"]
      },
      colors: {
        steel: {
          950: "#061225",
          900: "#0a1a36",
          850: "#10254d",
          800: "#18366b",
          700: "#254a86",
          500: "#61779f"
        },
        safety: {
          500: "#f4c430",
          600: "#d8a90f"
        }
      }
    }
  },
  plugins: []
};
