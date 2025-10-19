import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'On-chain Wordle',
  description: 'Plaintext Wordle on Polygon Amoy',
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 min-h-screen text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
