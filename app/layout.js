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
