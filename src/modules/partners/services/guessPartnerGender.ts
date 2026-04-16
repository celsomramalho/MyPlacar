export const guessPartnerGender = (name: string): 'M' | 'F' | undefined => {
  if (!name) return undefined;

  const firstWord = name.trim().split(' ')[0].toUpperCase();
  if (!firstWord || firstWord.length < 2) return undefined;

  const lastChar = firstWord.slice(-1);
  const femaleExceptions = ['ALICE', 'BEATRIZ', 'RAQUEL', 'ESTER', 'RUTE', 'IRIS'];

  if (femaleExceptions.includes(firstWord)) return 'F';
  return lastChar === 'A' ? 'F' : 'M';
};
