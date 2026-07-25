/**
 * "Skip for now" on onboarding must survive the redirect into /dashboard,
 * otherwise the layout guard bounces the user straight back. Scoped to the
 * tab (sessionStorage) so the prompt returns on a fresh visit.
 */
const SKIP_KEY = "leetsense.onboarding.skipped";

export function markOnboardingSkipped() {
  try {
    window.sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    // Private-mode storage failures shouldn't block navigation.
  }
}

export function hasSkippedOnboarding(): boolean {
  try {
    return window.sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}
