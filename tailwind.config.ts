import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#128044",
          hover: "#0b6837",
          light: "#dcf7e6",
        },
        accent: {
          DEFAULT: "#0ea5e9",
          soft: "#e0f2fe",
        },
        pitch: "#f3faf5",
        ink: "#142019",
      },
    },
  },
  plugins: [],
};

export default config;
