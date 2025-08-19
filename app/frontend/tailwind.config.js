/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.{ts,tsx,js}"
  ],
  theme: {
    extend: {
      fontFamily: {
        press: ['"Press Start 2P"', 'sans-serif'],
        rubik: ['"Rubik"', 'sans-serif']
      }
    }
  },
  plugins: []
};
