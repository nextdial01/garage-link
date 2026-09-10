/**
 * Extract a bearer token only for endpoints that explicitly support the
 * native-client transport. Authentication and authorization still happen in
 * adminEmailOtpServer before any OTP challenge is created or verified.
 */
export function extractAdminEmailOtpBearer(authorization: string | null, allowBearer: boolean) {
  if (!allowBearer) return undefined;
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}
