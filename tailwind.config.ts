import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      colors: {
        linkdrop: {
          ink: '#191a17',
          muted: '#777970',
          paper: '#f7f7f4',
          line: '#e3e4dd',
          lime: '#b8f36a',
          forest: '#466b23'
        }
      },
      boxShadow: {
        soft: '0 12px 36px rgba(25, 26, 23, 0.06)'
      }
    }
  },
  plugins: []
};

export default config;
