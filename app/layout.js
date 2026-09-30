import './globals.css';

export const metadata = {
  title: 'GroundTruth',
  description: 'Evidence-grounded field media intelligence for impact reporting.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
