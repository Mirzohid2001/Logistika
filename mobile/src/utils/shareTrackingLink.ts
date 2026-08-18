const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** API yoki deep link URL dan share token ajratadi. */
export function parseTrackingShareToken(input?: string | null): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (UUID_PATTERN.test(trimmed) && trimmed.length === 36) {
    return trimmed.toLowerCase();
  }

  const match = trimmed.match(UUID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

export function buildTrackingShareDeepLink(token: string): string {
  return `logistika://track/${token}`;
}

export function buildTrackingShareMessage(
  orderId: number,
  token: string,
  publicUrl: string,
  labels: { orderTitle: string; shareHint: string; appHint: string },
): string {
  const appLink = buildTrackingShareDeepLink(token);
  return [
    `${labels.orderTitle} #${orderId}`,
    `${labels.shareHint}: ${publicUrl}`,
    `${labels.appHint}: ${appLink}`,
  ].join('\n');
}
