export function getLocaleTag(language: string): string {
  return language === 'ru' ? 'ru-RU' : 'uz-UZ';
}

export function formatMoney(amount: number, language: string, suffix = "so'm"): string {
  const formatted = Number(amount || 0).toLocaleString(getLocaleTag(language));
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function formatShortDate(dateString: string, language: string): string {
  return new Date(dateString).toLocaleDateString(getLocaleTag(language), {
    day: 'numeric',
    month: 'short',
  });
}

export function formatLongDate(dateString: string, language: string): string {
  return new Date(dateString).toLocaleDateString(getLocaleTag(language), {
    day: 'numeric',
    month: 'long',
  });
}

export function formatDateTime(dateString: string, language: string): string {
  return new Date(dateString).toLocaleString(getLocaleTag(language), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(isoString: string | null, language: string): string {
  if (!isoString) {return '-';}
  return new Date(isoString).toLocaleTimeString(getLocaleTag(language), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTrendCompact(value: number): string {
  if (value >= 1_000_000) {return `${(value / 1_000_000).toFixed(1)}M`;}
  if (value >= 1_000) {return `${(value / 1_000).toFixed(0)}k`;}
  return String(Math.round(value));
}
