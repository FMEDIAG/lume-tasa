export function formatPrice(value: number): string {
  const options =
    value < 1
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 2 };

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    ...options,
  }).format(value);
}

