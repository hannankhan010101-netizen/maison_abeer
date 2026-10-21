/**
 * Chat is hidden unless the server under test was built with it on. The same
 * variable the app reads (`lib/features`), so a run with
 * `NEXT_PUBLIC_CHAT_ENABLED=1` exercises the chat specs and a normal run
 * skips them and checks the hidden behaviour instead.
 */
export const CHAT_ENABLED = process.env['NEXT_PUBLIC_CHAT_ENABLED'] === '1';
