import type { NextConfig } from "next";

// GitHub Pages serves the site under /<repo>/, so the CI build sets BASE_PATH; local dev stays at the root.
const config: NextConfig = { output: "export", basePath: process.env.BASE_PATH || "" };

export default config;
