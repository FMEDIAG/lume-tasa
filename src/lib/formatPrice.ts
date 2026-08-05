export function formatNumber(value: number): string {
  if (typeof value !== "number" || isNaN(value)) return "0";
  if (value < 1) return value.toFixed(2);
  if (value >= 1000) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPrice(value: number): string {
  const options =
    value < 1
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : value >= 1000
        ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        : { minimumFractionDigits: 0, maximumFractionDigits: 2 };

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    ...options,
  }).format(value);
}
