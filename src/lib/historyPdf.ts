import { jsPDF } from "jspdf";
import { getHistory, type Valuation } from "./history";
import { formatNumber } from "./formatPrice";

const NAVY: [number, number, number] = [26, 31, 58];
const GOLD: [number, number, number] = [212, 168, 83];
const CREAM: [number, number, number] = [245, 240, 230];
const MUTED: [number, number, number] = [120, 128, 150];

const L = {
  es: {
    title: "Informe de Tasaciones",
    subtitle: "Lume — Tasación experta por fotografía",
    generated: "Generado el",
    body: "Cuerpo del informe",
    summary: "Resumen",
    identification: "Identificación",
    confidence: "Confianza",
    notes: "Notas",
    sources: "Fuentes",
    category: "Categoría",
    total: "Tasaciones incluidas",
    rangeEur: "Rango total estimado (EUR)",
    rangeUsd: "Rango total estimado (USD)",
    average: "Valor medio estimado (EUR)",
    byCategory: "Por categoría",
    page: "Página",
    empty: "No hay tasaciones en el historial.",
    footer: "©2026 FMEDIAG - App Lume",
  },
  en: {
    title: "Appraisal Report",
    subtitle: "Lume — Expert appraisal from photos",
    generated: "Generated on",
    body: "Report body",
    summary: "Summary",
    identification: "Identification",
    confidence: "Confidence",
    notes: "Notes",
    sources: "Sources",
    category: "Category",
    total: "Appraisals included",
    rangeEur: "Total estimated range (EUR)",
    rangeUsd: "Total estimated range (USD)",
    average: "Average estimated value (EUR)",
    byCategory: "By category",
    page: "Page",
    empty: "No appraisals in history.",
    footer: "©2026 FMEDIAG - App Lume",
  },
};

export type PdfLang = keyof typeof L;

const M = 46; // margen
const W = 595.28; // A4 pt
const H = 841.89;

function ts(v: Valuation): number {
  return typeof v.createdAt === "number" ? v.createdAt : new Date(v.createdAt).getTime();
}

export async function exportHistoryPdf(lang: PdfLang = "es"): Promise<void> {
  const items = await getHistory();
  const t = L[lang];
  const locale = lang === "es" ? "es-ES" : "en-US";
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let page = 1;
  const decorate = () => {
    // marco premium
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.8);
    doc.rect(M - 14, M - 14, W - (M - 14) * 2, H - (M - 14) * 2);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(t.footer, W / 2, H - M + 10, { align: "center" });
    doc.text(`${t.page} ${page}`, W - M, H - M + 10, { align: "right" });
  };

  // ---------- Portada / Título ----------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 250, W, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(...GOLD);
  doc.text("LUME", W / 2, 210, { align: "center" });
  doc.setFontSize(24);
  doc.setTextColor(...CREAM);
  doc.text(t.title, W / 2, 300, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...MUTED);
  doc.text(t.subtitle, W / 2, 326, { align: "center" });
  doc.text(
    `${t.generated} ${new Date().toLocaleString(locale)}`,
    W / 2,
    348,
    { align: "center" }
  );
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text(`${t.total}: ${items.length}`, W / 2, 380, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(t.footer, W / 2, H - 40, { align: "center" });

  // ---------- Cuerpo ----------
  doc.addPage();
  page = 1;
  decorate();
  let y = M + 8;

  const ensure = (need: number) => {
    if (y + need > H - M - 6) {
      doc.addPage();
      page += 1;
      decorate();
      y = M + 8;
    }
  };

  const heading = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...NAVY);
    doc.text(text, M, y);
    y += 8;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.4);
    doc.line(M, y, W - M, y);
    y += 20;
  };

  const label = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text(text.toUpperCase(), M + 12, y);
    y += 12;
  };

  const paragraph = (text: string, indent = 12) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 64, 80);
    const lines = doc.splitTextToSize(text, W - M * 2 - indent * 2) as string[];
    for (const line of lines) {
      ensure(14);
      doc.text(line, M + indent, y);
      y += 13;
    }
    y += 4;
  };

  heading(t.body);

  if (items.length === 0) {
    paragraph(t.empty);
  }

  items.forEach((v, i) => {
    ensure(96);
    // tarjeta
    const top = y - 14;
    doc.setFillColor(250, 248, 244);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);

    const startY = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...NAVY);
    const titleLines = doc.splitTextToSize(
      `${i + 1}. ${v.title}`,
      W - M * 2 - 24
    ) as string[];
    for (const line of titleLines) {
      ensure(16);
      doc.text(line, M + 12, y);
      y += 15;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(new Date(v.createdAt).toLocaleString(locale), M + 12, y);
    y += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...GOLD);
    doc.text(
      `EUR ${formatNumber(v.priceEurMin)} – ${formatNumber(v.priceEurMax)}   |   USD ${formatNumber(
        v.priceUsdMin
      )} – ${formatNumber(v.priceUsdMax)}`,
      M + 12,
      y
    );
    y += 16;

    if (v.category) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(`${t.category}: ${v.category}`, M + 12, y);
      y += 14;
    }

    if (v.identification) {
      label(t.identification);
      paragraph(v.identification);
    }
    if (v.confidence) {
      label(t.confidence);
      paragraph(String(v.confidence));
    }
    if (v.notes) {
      label(t.notes);
      paragraph(v.notes);
    }
    if (v.sources && v.sources.length > 0) {
      label(t.sources);
      paragraph(v.sources.join(" · "));
    }

    // línea separadora dorada suave
    ensure(12);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(M + 12, y, W - M - 12, y);
    y += 18;
    void top;
    void startY;
  });

  // ---------- Resumen ----------
  doc.addPage();
  page += 1;
  decorate();
  y = M + 8;
  heading(t.summary);

  const sumMin = items.reduce((a, v) => a + v.priceEurMin, 0);
  const sumMax = items.reduce((a, v) => a + v.priceEurMax, 0);
  const sumMinU = items.reduce((a, v) => a + v.priceUsdMin, 0);
  const sumMaxU = items.reduce((a, v) => a + v.priceUsdMax, 0);
  const avg = items.length ? (sumMin + sumMax) / 2 / items.length : 0;

  const row = (k: string, val: string) => {
    ensure(20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(k, M + 12, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(val, W - M - 12, y, { align: "right" });
    y += 10;
    doc.setDrawColor(230, 224, 210);
    doc.setLineWidth(0.4);
    doc.line(M + 12, y, W - M - 12, y);
    y += 14;
  };

  row(t.total, String(items.length));
  row(t.rangeEur, `€${formatNumber(sumMin)} – €${formatNumber(sumMax)}`);
  row(t.rangeUsd, `$${formatNumber(sumMinU)} – $${formatNumber(sumMaxU)}`);
  row(t.average, `€${formatNumber(avg)}`);

  const byCat = new Map<string, number>();
  for (const v of items) {
    const k = v.category ?? "other";
    byCat.set(k, (byCat.get(k) ?? 0) + 1);
  }
  if (byCat.size > 0) {
    y += 10;
    label(t.byCategory);
    for (const [k, n] of Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])) {
      row(k, String(n));
    }
  }

  const oldest = items.length ? new Date(Math.min(...items.map(ts))) : null;
  const newest = items.length ? new Date(Math.max(...items.map(ts))) : null;
  if (oldest && newest) {
    y += 6;
    paragraph(
      lang === "es"
        ? `Periodo cubierto: ${oldest.toLocaleDateString(locale)} — ${newest.toLocaleDateString(locale)}.`
        : `Period covered: ${oldest.toLocaleDateString(locale)} — ${newest.toLocaleDateString(locale)}.`
    );
  }

  doc.setProperties({ title: t.title, subject: t.subtitle, creator: "Lume", author: "FMEDIAG" });

  // Datos incrustados tras %%EOF: los lectores de PDF los ignoran,
  // pero permiten reimportar el historial completo desde el propio PDF.
  const payload = JSON.stringify({ app: "Lume", kind: "valuation-history", version: 1, items });
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(payload)));
  const pdfBytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const tail = new TextEncoder().encode(`\n${DATA_MARKER}${encoded}${DATA_END}\n`);
  const blob = new Blob([pdfBytes, tail], { type: "application/pdf" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lume-informe-tasaciones-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Extrae el historial incrustado en un PDF Premium generado por Lume. */
export function extractHistoryJsonFromPdf(raw: string): string {
  const start = raw.indexOf(DATA_MARKER);
  const end = raw.indexOf(DATA_END, start);
  if (start === -1 || end === -1) {
    throw new Error("PDF_NO_LUME_DATA");
  }
  const encoded = raw.slice(start + DATA_MARKER.length, end).replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
