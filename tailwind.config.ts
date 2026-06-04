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
          DEFAULT: "#16803c",
          hover: "#116530",
          light: "#dff4e6",
        },
        ink: "#17201a",
      },
    },
  },
  plugins: [],
};

export default config;
