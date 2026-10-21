/**
 * Feature switches, decided when the app is built.
 *
 * Chat is hidden for now: the studio has one owner managing workshops and
 * schedules, and a chat room per class is more to look after than it is worth
 * yet. Nothing is deleted. The pages, components, API calls and tests are all
 * still here, and building with `NEXT_PUBLIC_CHAT_ENABLED=1` brings chat back
 * everywhere it was.
 *
 * Read from a `NEXT_PUBLIC_` variable so the browser bundle and the server
 * agree. Anything but the exact string `1` is off.
 */
export const CHAT_ENABLED = process.env.NEXT_PUBLIC_CHAT_ENABLED === '1';
