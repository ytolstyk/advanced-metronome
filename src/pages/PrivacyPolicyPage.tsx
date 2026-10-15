import { LegalPage } from '@/components/LegalPage/LegalPage';

export function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="October 14, 2026">
      <p>
        This Privacy Policy explains what information Advanced Metronome (the &ldquo;Service&rdquo;)
        collects, how it is used, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> if you sign in, your email address and authentication
          details are handled by AWS Amplify / Amazon Cognito.
        </li>
        <li>
          <strong>Your content and settings:</strong> drum patterns, click tracks, tabs, practice
          sessions, scores, preferences and similar data. Without an account this stays in your
          browser&rsquo;s localStorage. With an account it is also saved to the cloud so it follows you
          across devices.
        </li>
        <li>
          <strong>Published tabs:</strong> tabs you choose to publish are visible to other users.
        </li>
        <li>
          <strong>Bands:</strong> if you create or join a band, the name you choose for it, your
          display name, the songs you suggest, your up/down votes and your account&rsquo;s internal
          user ID are stored in the cloud. Anyone who has a band&rsquo;s link or ID can read that
          band&rsquo;s set lists, members&rsquo; display names and IDs, songs and votes, and the
          list of removed members&rsquo; IDs. Vote records (an ID, the song and your up/down choice,
          never names or titles) can also be looked up by any signed-in user who knows the set
          list&rsquo;s ID. Removing someone from a band hides them in the app but does not stop
          someone who already has the band&rsquo;s ID from reading it.
        </li>
        <li>
          <strong>Microphone (local analysis only):</strong> the tuner and fret memorizer can use your
          microphone. Pitch detection runs in your browser and the audio is not uploaded. You must
          grant permission first and can revoke it at any time.
        </li>
        <li>
          <strong>AI features (signed-in users only):</strong> when you use them, the following is
          sent to our AWS backend and on to Google Gemini: audio you record for tab transcription,
          YouTube links with start/end times for chord detection and drum extraction, and your
          practice goals and history for practice plans.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>
        To provide and improve the Service, save your progress, authenticate you, and operate
        AI-assisted features you request. We do not sell your personal information.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>Amazon Web Services (authentication, data storage, serverless functions).</li>
        <li>Google Gemini (AI-powered features listed above).</li>
        <li>PayPal and Venmo, if you choose to donate; they process payments under their own policies.</li>
      </ul>

      <h2>Data retention and your choices</h2>
      <p>
        Local data can be cleared via your browser settings. To request deletion of your account and
        cloud-stored data, contact us using the details below. Deleting a published tab removes it
        from the public library. When you leave a band you can also delete your own votes and songs
        in it. Deleted bands are closed and their name, invite code and member bans are cleared, but
        songs and votes written by other members may remain until those members remove them.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We use localStorage and authentication session storage that are necessary for the Service to
        function. If you open a band invite link while signed out, the invite code is kept in your
        browser&rsquo;s session storage until you finish joining, dismiss it or sign out. We do not
        use advertising cookies.
      </p>

      <h2>Children</h2>
      <p>The Service is not directed to children under 13, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>We may update this policy; the &ldquo;Last updated&rdquo; date above will change when we do.</p>

      <h2>Contact</h2>
      <p>
        Questions? Open an issue on{' '}
        <a href="https://github.com/ytolstyk/advanced-metronome" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        . Issues are public, so please don&rsquo;t post personal information there; ask for a private
        contact channel for account or data-deletion requests.
      </p>
    </LegalPage>
  );
}
