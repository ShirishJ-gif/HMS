export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    style: 'currency',
    maximumFractionDigits: 2,
  }).format(value);
}
