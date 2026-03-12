import { STORAGE_KEY } from '../../state';
import type { StorageValidationError } from '../../state';
import './StorageErrorBanner.css';

interface Props {
  error: StorageValidationError;
  onDismiss: () => void;
  onClear: () => void;
}

export function StorageErrorBanner({ error, onDismiss, onClear }: Props) {
  function handleClear() {
    localStorage.removeItem(STORAGE_KEY);
    onClear();
  }

  return (
    <div className="storage-error-banner" role="alert">
      <div className="storage-error-banner__icon">⚠</div>
      <div className="storage-error-banner__body">
        <strong className="storage-error-banner__title">Saved session data is out of sync</strong>
        <p className="storage-error-banner__reason">{error.reason}</p>
        <p className="storage-error-banner__hint">
          The app loaded with default settings. You can clear the out-of-sync data or keep working
          — your current session is unaffected.
        </p>
      </div>
      <div className="storage-error-banner__actions">
        <button className="storage-error-banner__btn storage-error-banner__btn--clear" onClick={handleClear}>
          Clear saved data
        </button>
        <button className="storage-error-banner__btn storage-error-banner__btn--dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
