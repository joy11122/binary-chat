import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#09140F", panel: "#101F17", mint: "#8BFFB5" } } },
  plugins: [],
};

export default config;
