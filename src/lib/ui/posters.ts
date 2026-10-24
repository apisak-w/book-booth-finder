const files = import.meta.glob<string>('/events/*/poster.{jpg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const posterUrl = (eventId: string, file: string): string | undefined => files[`/events/${eventId}/${file}`];
