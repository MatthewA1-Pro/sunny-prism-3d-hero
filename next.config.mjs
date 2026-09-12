import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keeps the dev compile badge out of QA screenshots.
  devIndicators: false,
  // Pin the workspace root: an unrelated package-lock.json in the parent
  // directory otherwise makes Turbopack infer the wrong root.
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
