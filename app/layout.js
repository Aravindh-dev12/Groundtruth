import './globals.css';

export const metadata = {
  title: 'GroundTruth — Evidence Intelligence',
  description: 'An AI-assisted evidence intelligence workspace for defensible impact reporting.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
