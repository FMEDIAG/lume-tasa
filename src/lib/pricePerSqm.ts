// Extrae las cifras de €/m² tal y como aparecen en las notas, sin redondear
// ni reformatear: se muestran en la UI con el valor exacto usado en el cálculo.
const PER_SQM_RE =
  /(\d[\d.,\s]*)\s*(?:€|EUR|euros?)\s*(?:\/|por\s+|per\s+)\s*m(?:2|²)/gi;

export function extractPricePerSqm(notes?: string | null): string[] {
  if (!notes) return [];
  const out: string[] = [];
  for (const m of notes.matchAll(PER_SQM_RE)) {
    const value = m[1]?.trim().replace(/\s+/g, " ");
    if (!value) continue;
    const label = `${value} €/m²`;
    if (!out.includes(label)) out.push(label);
  }
  return out.slice(0, 4);
}
