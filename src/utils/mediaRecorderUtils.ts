export function getSupportedMimeType(): string {
  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4;codecs=aac')) return 'audio/mp4;codecs=aac';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  }
  return 'audio/webm;codecs=opus';
}
