import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'MilestoneGuard — Move forward, with confidence.',
  description:
    'Agree on the work. Verify every milestone. Protect your payments. A complete freelancer accountability and project recovery workspace.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
