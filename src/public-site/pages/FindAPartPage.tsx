export function FindAPartPage() {
  return (
    <div className="fp-anim-in" style={{ paddingTop: '64px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 12px', textAlign: 'center' }}>
        <a href="/find-a-part.html" target="_blank" rel="noopener noreferrer" style={{ color: '#f87171', textDecoration: 'underline' }}>
          Form not displaying? Open Find a Part directly
        </a>
      </div>
      <iframe
        src="/find-a-part.html"
        title="Find a Part — Wolf Point Auto Parts"
        style={{ width: '100%', minHeight: '1100px', border: 'none', display: 'block' }}
      />
    </div>
  );
}
