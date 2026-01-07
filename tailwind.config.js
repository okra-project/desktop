/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{js,jsx,ts,tsx,ejs}',
    './src/main/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FDFBF7',
        ink: '#241c15',
        'okra-yellow': '#FFE01B',
        'okra-yellow-hover': '#E6C800',
        'okra-orange': '#FD4F00',
        lavender: '#E7E6F8',
        sage: '#D6EADF',
        'sidebar-bg': '#F9FAFB',
        'sidebar-text': '#4B5563',
        'sidebar-text-hover': '#111827',
        'sidebar-bg-hover': '#F3F4F6',
        'sidebar-border': '#E5E7EB',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['DM Serif Display', 'serif'],
      },
    },
  },
  plugins: [],
};
