import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FDE8EF",
          100: "#FBD1DF",
          200: "#F7A3BF",
          300: "#F3759F",
          400: "#EF477F",
          500: "#E91E63",
          600: "#C2185B",
          700: "#9C1350",
          800: "#750E3C",
          900: "#4F0A29",
          DEFAULT: "#E91E63",
        },
        secondary: {
          50: "#E8F5E9",
          100: "#C8E6C9",
          200: "#A5D6A7",
          300: "#81C784",
          400: "#66BB6A",
          500: "#4CAF50",
          600: "#43A047",
          700: "#388E3C",
          800: "#2E7D32",
          900: "#1B5E20",
          DEFAULT: "#4CAF50",
        },
        accent: {
          50: "#FBE9E7",
          100: "#FFCCBC",
          200: "#FFAB91",
          300: "#FF8A65",
          400: "#FF7043",
          500: "#FF5722",
          DEFAULT: "#FF8A65",
        },
        background: "#FFF8F6",
        surface: "#FFFFFF",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "Helvetica Neue",
          "Segoe UI",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "Malgun Gothic",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "sans-serif",
        ],
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
