const blockedKeyPattern =
  /secret|token|access_token|channel_secret|authorization|signature|password|api_key|service_role|line_user_id|user_id_raw|email|phone|tel|address|name|full_name|message|message_text|body|content|raw_event|form_answer|answer|inquiry|csv|file/i;

const maxDepth = 4;

function isPrimitive(value: unknown) {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > maxDepth) {
    return '[omitted]';
  }

  if (isPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  }

  if (typeof value === 'object' && value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        if (blockedKeyPattern.test(key)) {
          return [key, '[redacted]'];
        }

        return [key, redactValue(nestedValue, depth + 1)];
      })
    );
  }

  return '[omitted]';
}

export function redactRecord(details: Record<string, unknown> | undefined) {
  const safeDetails: Record<string, string | number | boolean | null> = {};

  Object.entries(details ?? {}).forEach(([key, value]) => {
    if (blockedKeyPattern.test(key)) {
      safeDetails[key] = '[redacted]';
      return;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safeDetails[key] = value;
      return;
    }

    safeDetails[key] = '[omitted]';
  });

  return safeDetails;
}
