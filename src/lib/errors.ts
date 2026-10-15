/** User-facing text for a thrown value (the default keeps raw failures from showing as "[object Object]"). */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
