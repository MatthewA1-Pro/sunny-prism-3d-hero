// Geometric sans closest to the design reference's typeface that is freely
// licensed. Self-hosted from npm, so neither the build nor the browser
// depends on reaching Google Fonts.
import '@fontsource-variable/manrope'

import './globals.css'

export const metadata = {
  title: 'Prism',
  description: 'Interactive 3D Prism experience',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F021F',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
