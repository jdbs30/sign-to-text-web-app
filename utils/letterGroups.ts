// utils/letterGroups.ts
export const LETTER_GROUPS = {
  G1: ['y', 'j'],
  G2: ['c', 'o'],
  G3: ['g', 'h'],
  G4: ['b','d','f','i','u','v','k','r','w'],
  G5: ['p','q','z'],
  G6: ['a','e','m','n','s','t'],
  G7: ['l'],
  G8: ['x'],
} as const;

export type GroupId = keyof typeof LETTER_GROUPS;

export function getGroupByLetter(letter: string): GroupId | null {
  letter = letter.toLowerCase();
  for (const g in LETTER_GROUPS) {
    if (LETTER_GROUPS[g as GroupId].includes(letter)) {
      return g as GroupId;
    }
  }
  return null;
}
