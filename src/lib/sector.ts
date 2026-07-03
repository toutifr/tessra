/**
 * Labels de secteur — remplace les cell_id bruts (ex. "r5432c123")
 * par un nom ludique "Secteur 5432·123".
 */
export function sectorLabel(cellId: string): string {
  const match = /^r(-?\d+)c(-?\d+)$/.exec(cellId);
  if (!match) return cellId;
  const row = Math.abs(Number(match[1]));
  const col = Math.abs(Number(match[2]));
  return `Sector ${row}·${col}`;
}
