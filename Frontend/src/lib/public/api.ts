/**
 * The public booking client.
 *
 * Deliberately separate from `lib/api/client.ts`: that one attaches a bearer
 * token and calls `onUnauthorized`, and neither makes sense here. A guest has
 * no session, and a 401 on this page would be a bug rather than a prompt to
 * sign in.
 */

export interface PublicStudio {
  name: string;
  instagram_handle: string | null;
}

export interface PublicClass {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  color_token: string;
  seats_left: number;
  is_full: boolean;
  waitlist_is_open: boolean;
}

export interface PublicClassList {
  studio: PublicStudio;
  classes: PublicClass[];
}

export interface BookingRequest {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  allergies?: string | null;
  note?: string | null;
  /** Honeypot. Always empty for a human; never rendered visibly. */
  website?: string | null;
}

export interface BookingResult {
  outcome: 'booked' | 'waitlisted';
  class_name: string;
  starts_at: string;
  location: string | null;
  waitlist_position: number | null;
}

export class BookingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
}

/**
 * Turn any failure into copy a guest can act on.
 *
 * A stranger who hits an error here has no support channel and no reason to
 * try twice, so the message has to carry the next step itself.
 */
async function readError(response: Response): Promise<never> {
  let message = 'Something went wrong on our side. Please try again in a moment.';

  try {
    const body = (await response.json()) as { message?: string };
    if (typeof body.message === 'string' && body.message) message = body.message;
  } catch {
    // A gateway error returns HTML; the default copy above is better than
    // showing the guest a parse failure.
  }

  throw new BookingError(message, response.status);
}

export async function fetchClasses(slug: string, signal?: AbortSignal): Promise<PublicClassList> {
  const response = await fetch(`${baseUrl()}/api/v1/public/${encodeURIComponent(slug)}/classes`, {
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await readError(response);
  return (await response.json()) as PublicClassList;
}

export async function submitBooking(
  slug: string,
  classId: string,
  body: BookingRequest,
): Promise<BookingResult> {
  const response = await fetch(
    `${baseUrl()}/api/v1/public/${encodeURIComponent(slug)}/classes/${classId}/book`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  if (!response.ok) await readError(response);
  return (await response.json()) as BookingResult;
}
