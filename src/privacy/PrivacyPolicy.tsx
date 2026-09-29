export default function PrivacyPolicy() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#1e293b',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      lineHeight: 1.6,
      padding: '0 16px',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 0 64px' }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: 4,
        }}>
          G10 OS Privacy Policy
        </h1>
        <p style={{
          fontSize: 14,
          color: '#64748b',
          marginBottom: 32,
        }}>
          Last updated: September 11, 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Section title="Overview">
            G10 OS is operated by G10 Enterprises LLC. This privacy policy describes how
            information is handled when you use the G10 OS application.
          </Section>

          <Section title="Information We Collect">
            The app may collect business and contact information that users enter into the
            app, including business names, phone numbers, email addresses, and details
            related to vehicles, parts, orders, and transactions.
          </Section>

          <Section title="Third-Party Services">
            The app may connect to third-party services such as eBay for marketplace
            functions. Third-party services are governed by their own privacy policies,
            and we encourage you to review the privacy policies of those services.
          </Section>

          <Section title="eBay Credentials">
            eBay account authorization tokens and credentials are used only to provide
            requested eBay functionality, such as publishing listings and syncing listing
            status. These credentials are not shared with or sold to any other party.
          </Section>

          <Section title="Data Retention">
            Information may be retained as needed to provide business functions, comply
            with applicable law, prevent fraud, or maintain business records.
          </Section>

          <Section title="No Sale of Personal Information">
            G10 OS does not sell personal information.
          </Section>

          <Section title="Your Rights">
            Users may request correction or deletion of their information by contacting
            G10 Enterprises LLC using the contact information below.
          </Section>

          <Section title="Security">
            Reasonable security measures are used to protect information. However, no
            system or method of transmission is guaranteed to be completely secure, and
            we cannot guarantee absolute security.
          </Section>

          <Section title="Contact">
            <p style={{ margin: 0 }}>G10 Enterprises LLC</p>
            <p style={{ margin: 0 }}>Wolf Point, Montana</p>
          </Section>
        </div>

        <p style={{
          fontSize: 13,
          color: '#94a3b8',
          marginTop: 40,
          textAlign: 'center',
        }}>
          &copy; {new Date().getFullYear()} G10 Enterprises LLC. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{
        fontSize: 17,
        fontWeight: 600,
        color: '#1e293b',
        marginBottom: 8,
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: '#475569' }}>
        {children}
      </div>
    </section>
  );
}
