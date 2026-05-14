export const sanitizeForFirestore = (obj: unknown) => {
  // campos undefined são convertidos para null pelo JSON.stringify abaixo.
  // O deepClean depois remove campos null que NÃO devem sobrescrever dados
  // existentes no Firestore via merge (ex: controllers: undefined -> null
  // apagaria todos os controllers registrados por outros devices).
  const clean = JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
  const fieldsToRemove = ['isWatchMode', 'isScoreboardMode', 'brightness', 'volume', 'deviceLabel', 'selectedVoiceURI', 'voiceEnabled', 'voiceScoring', 'actionCooldown', 'stateLockout', 'screenDimTimeout', 'customSportIcon', 'customSportIcons', 'customCategoryIcons', 'cloudSportIcons', 'cloudCategoryIcons'];
  // nullFieldsToRemove: quando null, remover do payload para nao sobrescrever no Firestore
  const nullFieldsToRemove = ['controllers'];
  const deepClean = (target: Record<string, unknown>) => {
    if (!target || typeof target !== 'object') return;
    fieldsToRemove.forEach(f => { if (target[f] !== undefined) delete target[f]; });
    nullFieldsToRemove.forEach(f => { if (target[f] === null) delete target[f]; });
    Object.keys(target).forEach(key => { if (target[key] && typeof target[key] === 'object') deepClean(target[key] as Record<string, unknown>); });
  };
  deepClean(clean);
  return clean;
};
