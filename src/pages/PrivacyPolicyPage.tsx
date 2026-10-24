import { LegalPage } from '@/components/LegalPage/LegalPage';

export function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="October 23, 2026">
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
          display name, the instruments you say you play, the songs you suggest (with their tuning), your up/down votes, the colors you give songs, the names you give a band&rsquo;s colors (any member can change them) and your account&rsquo;s internal
          user ID are stored in the cloud. Anyone who has a band&rsquo;s link or ID can read that
          band&rsquo;s set lists, members&rsquo; display names, instruments and IDs, songs and votes, and the
          list of removed members&rsquo; IDs. Vote records (an ID, the song and your up/down choice,
          never names or titles) can also be looked up by anyone, signed in or not, who knows the set
          list&rsquo;s ID. Removing someone from a band hides them in the app but does not stop
          someone who already has the band&rsquo;s ID from reading it. Invite links expire after a period
          the owner picks (1 to 7 days), but the app alone applies that: it does not stop anyone who already
          has the band&rsquo;s ID, or who has an old link or code and uses the service directly, from joining. The band&rsquo;s owner can
          share a set list: anyone with its link can then view it without signing in. The page shows
          its songs, links and vote totals, not member names. The records behind it are not scoped to
          that list, though: the signed-out read access applies to every band, not only shared lists,
          so anyone who has a shared link (or any band or set list ID) can also read, without signing
          in, the band behind it (including its invite code, which lets them join), its members&rsquo;
          display names and account IDs, its votes and the songs of its other set lists. Turning sharing off hides the list in the app but does not revoke that access
          for someone who already has the link.
        </li>
        <li>
          <strong>Band availability:</strong> if you mark times you can practice, those times (and
          when you last saved them) are stored in the cloud under your account&rsquo;s internal user ID.
          Only the times you mark free are stored. Anyone with an account who has the band&rsquo;s link
          can read them, because member IDs are visible to anyone with the link. That includes a link
          to a shared set list, and patterns of free time can reveal when you are away. You can delete
          your availability at any time from the availability page. It is also deleted when you leave
          a band, if that deletion succeeds. If the owner removes you, or the band is deleted, your
          availability may remain readable until you dismiss the band, and if you never do, until you delete it or ask us to.
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
        <li>
          Spotify, YouTube, Apple Music and SoundCloud: when you paste a song link into a set list,
          our backend asks that service for the song&apos;s title and artist. Only the track
          identifier from the link is sent, not your account or address.
        </li>
        <li>PayPal and Venmo, if you choose to donate; they process payments under their own policies.</li>
      </ul>

      <h2>Data retention and your choices</h2>
      <p>
        Local data can be cleared via your browser settings. To request deletion of your account and
        cloud-stored data, contact us using the details below. Deleting a published tab removes it
        from the public library. When you leave a band you can also delete your own votes and songs
        in it, and we try to delete your availability too. Deleted bands are closed and their name, invite code and member bans are cleared, but
        songs and votes written by other members may remain until those members remove them.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We use localStorage and authentication session storage that are necessary for the Service to
        function, including your availability page preferences and whether you have seen its notice. If you open a band invite link while signed out, the invite code is kept in your
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
