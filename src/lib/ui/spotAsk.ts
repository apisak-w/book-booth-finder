export const askKey = (eventId: string) => `bf:${eventId}:asked`;

export function mayAsk(saved: string | null, today: string): boolean {
  if (!saved) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(saved) && saved < today;
}

export const afterAnswer = (send: boolean, never: boolean, today: string) => (send ? 'sent' : never ? 'never' : today);
