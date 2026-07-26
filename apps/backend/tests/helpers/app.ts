import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/jwt.js";

export const TEST_USER_ID = "user-1";
export const TEST_USER_EMAIL = "learner@example.com";

/** The real Express app, with the real auth middleware and error handler. */
export const app = createApp();

/**
 * A genuinely signed access token, so `requireAuth` runs its real verification
 * rather than being stubbed out.
 */
export function authHeader(userId: string = TEST_USER_ID, email: string = TEST_USER_EMAIL): string {
  return `Bearer ${signAccessToken({ sub: userId, email })}`;
}
