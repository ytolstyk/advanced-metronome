/**
 * Rejects with `<label> timed out` if `work` takes longer than `ms`. The work itself is not
 * cancelled (there is nothing to abort): this only stops the caller waiting for it.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
