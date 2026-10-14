'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main style={{ maxWidth: 620, margin: '12vh auto', padding: 32, fontFamily: 'system-ui' }}>
      <p style={{ color: '#167362', fontWeight: 700 }}>MILESTONEGUARD</p>
      <h1>We couldn’t open this view.</h1>
      <p>Your saved work is still in the database. Try loading the view again.</p>
      <button
        onClick={reset}
        style={{
          padding: '12px 20px',
          background: '#123a32',
          color: 'white',
          border: 0,
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </main>
  );
}
