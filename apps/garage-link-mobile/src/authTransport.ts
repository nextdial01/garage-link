const AUTH_REQUEST_TIMEOUT_MS = 20_000;

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super('Authentication request timed out');
    this.name = 'AuthRequestTimeoutError';
  }
}

type FetchImplementation = typeof fetch;

/**
 * React Native fetch can otherwise leave an Auth request unresolved indefinitely.
 * This wrapper never inspects or logs a request body, so passwords and tokens
 * remain confined to the authenticated transport.
 */
export function createAuthFetch(fetchImplementation: FetchImplementation, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): FetchImplementation {
  return async (input, init) => {
    const controller = new AbortController();
    let timedOut = false;
    const parentSignal = init?.signal;
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(timedOut ? new AuthRequestTimeoutError() : controller.signal.reason);
        }, { once: true });
      });
      return await Promise.race([
        fetchImplementation(input, { ...init, signal: controller.signal }),
        aborted,
      ]);
    } catch (error) {
      if (timedOut) throw new AuthRequestTimeoutError();
      throw error;
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  };
}

export const authFetch = createAuthFetch(fetch);
