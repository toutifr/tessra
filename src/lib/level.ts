/**
 * Niveau cosmétique client — dérivé du total de Reis gagnés (xp).
 * level = 1 + floor(sqrt(xp / 60)). Purement visuel, aucun impact serveur.
 */
export interface LevelInfo {
  level: number;
  /** 0 → 1 vers le niveau suivant */
  progress: number;
  /** xp accumulé dans le niveau courant */
  xpInto: number;
  /** xp nécessaire pour passer au niveau suivant */
  xpNeeded: number;
}

export function levelFromXp(totalEarned: number): LevelInfo {
  const xp = Math.max(0, totalEarned);
  const level = 1 + Math.floor(Math.sqrt(xp / 60));
  const floorXp = (level - 1) ** 2 * 60; // xp au début du niveau courant
  const nextXp = level ** 2 * 60;        // xp requis pour le niveau suivant
  const xpNeeded = nextXp - floorXp;
  const xpInto = xp - floorXp;
  return {
    level,
    progress: xpNeeded > 0 ? Math.min(xpInto / xpNeeded, 1) : 1,
    xpInto,
    xpNeeded,
  };
}
