import type { Metadata, Viewport } from 'next';

import './globals.css';

/**
 * No `next/font/google` here on purpose.
 *
 * `next/font` downloads the font at *build* time, which makes the build fail
 * or hang on a machine without internet access — fatal for a self-hosted
 * app. The system font stack is used instead, and Material Symbols is loaded
 * from the browser at runtime.
 */
export const metadata: Metadata = {
  title: 'FreeLM — open-source research assistant',
  description:
    'FreeLM is a free, open-source, unrestricted research and study assistant. Add sources, chat with grounded answers and citations, and generate studio artifacts — everything unlocked, no premium tier.',
  applicationName: 'FreeLM',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FreeLM',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0b0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&display=swap"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-neutral-100">
        {children}
      </body>
    </html>
  );
}
