import Link from 'next/link';
export default function NotFound() {
  return (
    <main style={{ maxWidth: 620, margin: '12vh auto', padding: 32, fontFamily: 'system-ui' }}>
      <p style={{ color: '#167362', fontWeight: 700 }}>MILESTONEGUARD</p>
      <h1>This page isn’t here.</h1>
      <p>Open your workspace to find your projects and milestones.</p>
      <Link href="/">Back to workspace</Link>
    </main>
  );
}
