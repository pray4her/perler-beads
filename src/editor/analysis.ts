import type { EditorDocumentV1 } from "@/editor/types";

export interface ManufacturingWarning {
  id: string;
  kind: "isolated" | "small-component" | "articulation" | "articulation-chain";
  message: string;
  indices: number[];
}

function neighbors(index: number, width: number, height: number) {
  const row = Math.floor(index / width);
  const col = index % width;
  const output: number[] = [];
  if (row > 0) output.push(index - width);
  if (row + 1 < height) output.push(index + width);
  if (col > 0) output.push(index - 1);
  if (col + 1 < width) output.push(index + 1);
  return output;
}

export function countColors(document: EditorDocumentV1) {
  const counts = new Uint32Array(document.palette.length);
  for (const index of document.cells) if (index > 0) counts[index] += 1;
  return Array.from(counts, (count, index) => ({ index, count, palette: document.palette[index] })).filter((item) => item.count > 0);
}

export function analyzeManufacturingRisks(document: EditorDocumentV1): ManufacturingWarning[] {
  const warnings: ManufacturingWarning[] = [];
  const occupied = Uint8Array.from(document.cells, (value) => Number(value !== 0));
  const visited = new Uint8Array(occupied.length);
  for (let index = 0; index < occupied.length; index++) {
    if (!occupied[index] || visited[index]) continue;
    const component: number[] = [];
    const stack = [index];
    visited[index] = 1;
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of neighbors(current, document.width, document.height)) {
        if (occupied[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    if (component.length === 1) {
      warnings.push({ id: `isolated-${index}`, kind: "isolated", message: "发现孤立拼豆", indices: component });
    } else if (component.length <= 3) {
      warnings.push({ id: `small-${index}`, kind: "small-component", message: `发现仅 ${component.length} 颗的小区域`, indices: component });
    }
  }

  const discovery = new Int32Array(occupied.length).fill(-1);
  const low = new Int32Array(occupied.length);
  let time = 0;
  const articulation = new Set<number>();
  const visit = (index: number, parent: number) => {
    discovery[index] = low[index] = time++;
    let children = 0;
    for (const next of neighbors(index, document.width, document.height)) {
      if (!occupied[next]) continue;
      if (discovery[next] === -1) {
        children += 1;
        visit(next, index);
        low[index] = Math.min(low[index], low[next]);
        if (parent === -1 ? children > 1 : low[next] >= discovery[index]) articulation.add(index);
      } else if (next !== parent) {
        low[index] = Math.min(low[index], discovery[next]);
      }
    }
  };
  for (let index = 0; index < occupied.length; index++) if (occupied[index] && discovery[index] === -1) visit(index, -1);
  for (const index of articulation) {
    warnings.push({ id: `articulation-${index}`, kind: "articulation", message: "此拼豆连接多个区域，制作时容易断开", indices: [index] });
  }
  const articulationVisited = new Set<number>();
  for (const index of articulation) {
    if (articulationVisited.has(index)) continue;
    const chain: number[] = [];
    const stack = [index];
    articulationVisited.add(index);
    while (stack.length) {
      const current = stack.pop()!;
      chain.push(current);
      for (const next of neighbors(current, document.width, document.height)) {
        if (articulation.has(next) && !articulationVisited.has(next)) {
          articulationVisited.add(next);
          stack.push(next);
        }
      }
    }
    if (chain.length >= 4) warnings.push({ id: `chain-${index}`, kind: "articulation-chain", message: `发现 ${chain.length} 格连续脆弱连接`, indices: chain });
  }
  return warnings;
}

export function getBoardSummary(document: EditorDocumentV1) {
  const boardColumns = Math.ceil(document.width / document.board.columns);
  const boardRows = Math.ceil(document.height / document.board.rows);
  const boards = Array.from({ length: boardColumns * boardRows }, (_, index) => ({
    number: index + 1,
    row: Math.floor(index / boardColumns),
    col: index % boardColumns,
    count: 0,
  }));
  let total = 0;
  for (let row = 0; row < document.height; row++) {
    for (let col = 0; col < document.width; col++) {
      if (!document.cells[row * document.width + col]) continue;
      total += 1;
      const boardRow = Math.floor(row / document.board.rows);
      const boardCol = Math.floor(col / document.board.columns);
      boards[boardRow * boardColumns + boardCol].count += 1;
    }
  }
  return {
    boardColumns,
    boardRows,
    boards,
    total,
    physicalWidthMm: document.width * document.board.pitchMm,
    physicalHeightMm: document.height * document.board.pitchMm,
  };
}
