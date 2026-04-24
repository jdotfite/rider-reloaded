export function splitSvgPathSubpaths(d: string): string[] {
  const trimmed = d.trim();
  if (!trimmed) return [];

  const subpaths: string[] = [];
  let current = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    const isMoveCommand = char === 'M' || char === 'm';

    if (isMoveCommand && current.trim().length > 0) {
      subpaths.push(current.trim());
      current = char;
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    subpaths.push(current.trim());
  }

  return subpaths;
}
