export const LETTER_GROUPS: Record<string, string[]> = {
  G1: ['y', 'j'],
  G2: ['c', 'o'],
  G3: ['g', 'h'],
  G4: ['b','d','f','i','u','v','k','r','w'],
  G5: ['p','q','z'],
  G6: ['a','e','m','n','s','t'],
  G7: ['l'],
  G8: ['x']
};

export function getLetterGroup(letter: string): string {
  const l = letter.toLowerCase();
  for (const g in LETTER_GROUPS) {
    if (LETTER_GROUPS[g].includes(l)) return g;
  }
  throw new Error(`Unknown letter group for ${letter}`);
}
