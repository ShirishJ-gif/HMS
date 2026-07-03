export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    style: 'currency',
    maximumFractionDigits: 2,
  }).format(value);
}

export function capitalizeFirstLetter(value: string) {
  if (!value) return value;

  const firstVisibleIndex = value.search(/\S/);
  if (firstVisibleIndex === -1) return value;

  return `${value.slice(0, firstVisibleIndex)}${value.charAt(firstVisibleIndex).toUpperCase()}${value.slice(firstVisibleIndex + 1)}`;
}

export function formatCompactReservationId(value: string, visibleStart = 6, visibleEnd = 7) {
  if (!value) return value;

  const separatorIndex = value.indexOf('-');
  if (separatorIndex > 0 && separatorIndex < value.length - 1) {
    const prefix = value.slice(0, separatorIndex + 1);
    const suffix = value.slice(separatorIndex + 1);
    if (suffix.length <= visibleStart + visibleEnd + 1) return value;
    return `${prefix}${suffix.slice(0, visibleStart)}…${suffix.slice(-visibleEnd)}`;
  }

  if (value.length <= visibleStart + visibleEnd + 1) return value;
  return `${value.slice(0, visibleStart)}…${value.slice(-visibleEnd)}`;
}
