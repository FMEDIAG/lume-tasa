import { ValuationRecord } from "./db";

/**
 * Genera e imprime/descarga un informe técnico oficial en PDF 
 * a partir de un registro de tasación de LumeDB.
 */
export function generateValuationPDF(record: ValuationRecord): void {
  // Formateador estricto de moneda sin redondeo
  const formatExact = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const formattedDate = new Date(record.createdAt).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Separar imágenes generales de imágenes macro
  const generalImages = record.images.filter((img) => !img.isMacro);
  const macroImages = record.images.filter((img) => img.isMacro);

  // Crear ventana emergente de impresión optimizada para PDF
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Por favor, permite las ventanas emergentes para generar el PDF.");
    return;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de Tasación Lume - ${record.id}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .brand {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #0f172a;
    }
    .brand span {
      color: #0284c7;
    }
    .subtitle {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      font-weight: 700;
    }
    .meta-box {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }
    .meta-id {
      font-weight: 800;
      color: #0284c7;
      font-size: 13px;
    }
    .main-valuation {
      background-color: #f0f9ff;
      border-left: 4px solid #0284c7;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .valuation-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
    }
    .valuation-amount {
      font-size: 28px;
      font-weight: 900;
      color: #0f172a;
      margin: 4px 0;
    }
    .valuation-detail {
      font-size: 11px;
      font-weight: 700;
      color: #0369a1;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }
    .info-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background-color: #f8fafc;
    }
    .info-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .info-value {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 20px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .step-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      background-color: #ffffff;
    }
    .step-header {
      font-weight: 800;
      color: #0f172a;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .step-badge {
      background-color: #e0f2fe;
      color: #0369a1;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 800;
      margin-right: 6px;
    }
    .step-desc {
      color: #334155;
      font-size: 11px;
    }
    .gallery {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    .gallery-item {
      position: relative;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      height: 110px;
    }
    .gallery-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .badge-macro {
      position: absolute;
      top: 4px;
      left: 4px;
      background-color: #0284c7;
      color: #ffffff;
      font-size: 8px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
    }
    .badge-zoom {
      position: absolute;
      top: 4px;
      right: 4px;
      background-color: rgba(15, 23, 42, 0.8);
      color: #ffffff;
      font-size: 8px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
    }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      text-align: center;
      font-size: 9px;
      color: #94a3b8;
    }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand">LUME <span>AI</span></div>
      <div class="subtitle">Informe Oficial de Tasación de Inmuebles</div>
    </div>
    <div class="meta-box">
      <div class="meta-id">Expediente: ${record.id}</div>
      <div>Fecha: ${formattedDate}</div>
      <div>Nivel de Confianza: ${(record.confidenceScore * 100).toFixed(1)}%</div>
    </div>
  </div>

  <div class="main-valuation">
    <div class="valuation-title">VALORACIÓN DE MERCADO CERTIFICADA</div>
    <div class="valuation-amount">${formatExact(record.totalValuation)}</div>
    <div class="valuation-detail">
      Métrico Exacto: ${record.exactPricePerM2.toLocaleString("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €/m² | Superficie Útil: ${record.usefulArea.toFixed(2)} m² (Regla de No Redondeo Aplicada)
    </div>
  </div>

  <div class="grid-2">
    <div class="info-card">
      <div class="info-label">Tipo de Activo</div>
      <div class="info-value">${record.assetType}</div>
    </div>
    <div class="info-card">
      <div class="info-label">Ubicación / Zona</div>
      <div class="info-value">${record.location}</div>
    </div>
  </div>

  <div class="section-title">RAZONAMIENTO MULTIMODAL (CHAIN OF THOUGHT)</div>
  ${record.reasoningSteps
    .map(
      (step) => `
    <div class="step-card">
      <div class="step-header">
        <span class="step-badge">PASO ${step.step}</span>
        ${step.title}
      </div>
      <div class="step-desc">${step.description}</div>
    </div>
  `
    )
    .join("")}

  ${
    macroImages.length > 0
      ? `
    <div class="section-title">EVIDENCIA FOTOGRÁFICA MACRO (ANÁLISIS DE MATERIALES)</div>
    <div class="gallery">
      ${macroImages
        .map(
          (img) => `
        <div class="gallery-item">
          <img src="${img.dataUrl}" alt="Macro Evidencia" />
          <span class="badge-macro">MACRO</span>
          <span class="badge-zoom">${img.zoom}x</span>
        </div>
      `
        )
        .join("")}
    </div>
  `
      : ""
  }

  ${
    generalImages.length > 0
      ? `
    <div class="section-title">VISTAS GENERALES DEL ACTIVO</div>
    <div class="gallery">
      ${generalImages
        .map(
          (img) => `
        <div class="gallery-item">
          <img src="${img.dataUrl}" alt="Vista General" />
          <span class="badge-zoom">${img.zoom}x</span>
        </div>
      `
        )
        .join("")}
    </div>
  `
      : ""
  }

  <div class="footer">
    Documento generado automáticamente por Lume AI. Los cálculos mantienen exactitud métrica sin redondeo comercial.
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
