export function resolveChar(
  cnnChar: string,
  cnnConf: number,
  heuristic: any,
  prevChar: string
) {
  const hChar = heuristic.letter;

  // 1. Special gestures (heuristics dominate)
  if ([" ", "Backspace", "next"].includes(hChar)) {
    return hChar;
  }

  // 2. Perfect agreement
  if (cnnChar === hChar && cnnConf > 0.5) {
    return cnnChar;
  }

  // 3. CNN confident, heuristic compatible
  if (cnnConf > 0.75 && hChar.length === 1) {
    return cnnChar;
  }

  // 4. CNN uncertain → fallback
  if (cnnConf < 0.6 && hChar.length === 1) {
    return hChar;
  }

  // 5. Disagreement → keep previous
  return prevChar;
}
