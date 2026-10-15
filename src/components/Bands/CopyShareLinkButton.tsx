import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sharedSetListPath } from '../../bandRoutes';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';

/** Copies the public link of a shared set list (anyone with it can read the list, signed in or not). */
export function CopyShareLinkButton({ setListId, setListName }: { setListId: string; setListName: string }) {
  const [copied, copy] = useCopyToClipboard();
  const [failed, setFailed] = useState(false);
  const label = copied ? 'Copied!' : failed ? 'Couldn’t copy' : 'Copy link';
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Copy share link for ${setListName}`}
      onClick={async () => setFailed(!(await copy(`${window.location.origin}${sharedSetListPath(setListId)}`)))}
    >
      <Link2 size={14} className="mr-1" aria-hidden="true" />
      {label}
    </Button>
  );
}
