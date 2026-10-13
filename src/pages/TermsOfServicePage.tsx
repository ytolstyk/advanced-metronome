import { LegalPage } from '@/components/LegalPage/LegalPage';

export function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="October 12, 2026">
      <p>
        By using Advanced Metronome (the &ldquo;Service&rdquo;) you agree to these Terms. If you do not
        agree, please do not use the Service.
      </p>

      <h2>Use of the Service</h2>
      <p>
        The Service provides music practice tools. You agree to use it lawfully and not to disrupt,
        reverse engineer, or abuse it, including its AI-assisted features and APIs.
      </p>

      <h2>Accounts</h2>
      <p>
        Some features require an account. You are responsible for your credentials and for activity
        under your account.
      </p>

      <h2>Your content</h2>
      <p>
        You retain ownership of content you create. If you publish a tab, you grant us a non-exclusive
        license to host and display it to other users. You must have the right to share what you
        publish and must not post unlawful, infringing, or abusive content. We may remove content at
        our discretion.
      </p>

      <h2>AI-generated output</h2>
      <p>
        AI features may produce inaccurate or incomplete results. Review them before relying on them.
      </p>

      <h2>Availability and changes</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and may change, be interrupted, or be discontinued at
        any time. Back up content you care about.
      </p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the Service is provided without warranties of any kind,
        and we are not liable for any indirect, incidental, or consequential damages, or for loss of
        data, arising from your use of the Service.
      </p>

      <h2>Termination</h2>
      <p>We may suspend or terminate access for violations of these Terms. You may stop using the Service at any time.</p>

      <h2>Changes to these Terms</h2>
      <p>We may update these Terms; continued use after changes means you accept them.</p>

      <h2>Contact</h2>
      <p>
        Questions? Open an issue on{' '}
        <a href="https://github.com/ytolstyk/advanced-metronome" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}
