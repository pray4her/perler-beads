import { countColors, getBoardSummary } from "@/editor/analysis";
import type { EditorDocumentV1 } from "@/editor/types";

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成图片")), "image/png"));
}

export async function renderProductPng(
  document: EditorDocumentV1,
  options: { scale?: number; background?: string | null } = {},
) {
  const scale = Math.max(1, Math.min(32, Math.round(options.scale ?? 8)));
  const canvas = window.document.createElement("canvas");
  canvas.width = document.width * scale;
  canvas.height = document.height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建导出画布");
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (let row = 0; row < document.height; row++) {
    for (let col = 0; col < document.width; col++) {
      const paletteIndex = document.cells[row * document.width + col];
      if (!paletteIndex) continue;
      context.fillStyle = document.palette[paletteIndex]?.color ?? "transparent";
      context.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  return canvasBlob(canvas);
}

export async function copyProductToClipboard(document: EditorDocumentV1) {
  const blob = await renderProductPng(document);
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") throw new Error("浏览器不支持图片剪贴板");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function createPatternCsv(document: EditorDocumentV1) {
  const rows: string[] = [];
  for (let row = 0; row < document.height; row++) {
    const values: string[] = [];
    for (let col = 0; col < document.width; col++) {
      const paletteIndex = document.cells[row * document.width + col];
      values.push(paletteIndex ? document.palette[paletteIndex]?.key ?? "" : "");
    }
    rows.push(values.map((value) => `"${value.replaceAll('"', '""')}"`).join(","));
  }
  return new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

export async function exportPatternPdf(document: EditorDocumentV1, paper: "a4" | "a3" = "a4") {
  const { jsPDF } = await import("jspdf");
  const orientation = document.width >= document.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: paper });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const titleHeight = 16;
  const summary = getBoardSummary(document);
  const boardWidth = document.board.columns;
  const boardHeight = document.board.rows;
  const pages = summary.boardColumns * summary.boardRows;
  for (let page = 0; page < pages; page++) {
    if (page > 0) pdf.addPage(paper, orientation);
    const boardRow = Math.floor(page / summary.boardColumns);
    const boardCol = page % summary.boardColumns;
    const startRow = boardRow * boardHeight;
    const startCol = boardCol * boardWidth;
    const rows = Math.min(boardHeight, document.height - startRow);
    const cols = Math.min(boardWidth, document.width - startCol);
    const cell = Math.min((pageWidth - margin * 2) / cols, (pageHeight - margin * 2 - titleHeight - 26) / rows);
    const x = margin;
    const y = margin + titleHeight;
    pdf.setTextColor(20, 20, 19);
    pdf.setFontSize(14);
    pdf.text(`${document.name} · ${document.colorSystem}`, margin, margin + 5);
    pdf.setFontSize(8);
    pdf.text(`Board ${page + 1}/${pages} · ${cols}×${rows} · 200 DPI layout`, pageWidth - margin, margin + 5, { align: "right" });
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const paletteIndex = document.cells[(startRow + row) * document.width + startCol + col];
        const entry = document.palette[paletteIndex];
        if (paletteIndex && entry) {
          pdf.setFillColor(entry.color);
          pdf.rect(x + col * cell, y + row * cell, cell, cell, "F");
        }
        pdf.setDrawColor(115, 115, 110);
        pdf.setLineWidth((row % 5 === 0 || col % 5 === 0) ? 0.25 : 0.08);
        pdf.rect(x + col * cell, y + row * cell, cell, cell);
        if (paletteIndex && entry && cell >= 4) {
          pdf.setFontSize(Math.max(4, Math.min(7, cell * 0.55)));
          pdf.setTextColor(20, 20, 19);
          pdf.text(entry.key, x + (col + 0.5) * cell, y + (row + 0.62) * cell, { align: "center", maxWidth: cell * 0.9 });
        }
      }
    }
    pdf.setFontSize(7);
    pdf.text(`Page ${page + 1} · Board ${page + 1} · 坐标 ${startCol + 1},${startRow + 1}`, margin, pageHeight - 7);
  }
  const usage = countColors(document);
  pdf.addPage(paper, "portrait");
  pdf.setFontSize(15);
  pdf.text("用料清单", margin, margin + 5);
  pdf.setFontSize(9);
  usage.forEach((item, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + column * 60;
    const y = margin + 16 + row * 8;
    pdf.setFillColor(item.palette.color);
    pdf.rect(x, y - 4, 6, 6, "F");
    pdf.setTextColor(20, 20, 19);
    const stock = document.inventory[`${document.colorSystem}:${item.palette.key}`];
    const shortage = stock === undefined ? "" : stock < item.count ? ` · 缺 ${item.count - stock}` : "";
    pdf.text(`${item.palette.key}  ${item.count}${shortage}`, x + 9, y);
  });
  return pdf.output("blob");
}
