import React, { useState, useMemo } from 'react';
import { Bookmark, Check, ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Toggle } from '@shared/components/Toggle';
import {
  type MatchRulesConfig,
  type MatchRulesPreset,
  type EventSportRules,
  getAllPresets,
  saveCustomPreset,
  deleteCustomPreset,
  getDefaultRulesForSport,
  SYSTEM_RULE_PRESETS,
} from '@modules/events/domain/rules/eventMatchRules';

interface EventMatchRulesEditorProps {
  sportRules?: EventSportRules;
  sportId?: string;
  isReadOnly: boolean;
  onChangeSportRules: (rules: EventSportRules) => void;
}

const PHASES: Array<{ key: 'groups' | 'playoffs' | 'semifinal' | 'final'; label: string; description: string }> = [
  { key: 'groups', label: 'Fase de grupos', description: 'Partidas da fase classificatória' },
  { key: 'playoffs', label: 'Eliminatórias', description: 'Oitavas e quartas de final' },
  { key: 'semifinal', label: 'Semifinais', description: 'Partidas das semifinais' },
  { key: 'final', label: 'Final e 3º lugar', description: 'Partidas decisivas' },
];

export const EventMatchRulesEditor: React.FC<EventMatchRulesEditorProps> = ({
  sportRules,
  sportId,
  isReadOnly,
  onChangeSportRules,
}) => {
  const [allPresets, setAllPresets] = useState<MatchRulesPreset[]>(() => getAllPresets());
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [expandedPhaseKey, setExpandedPhaseKey] = useState<string | null>(null);

  const isPickleball = sportId === 'pickleball';
  const isTennis = sportId === 'tennis';

  const currentRules: EventSportRules = useMemo(() => {
    return {
      defaultRules: sportRules?.defaultRules ?? getDefaultRulesForSport(sportId),
      customPhasesEnabled: sportRules?.customPhasesEnabled ?? false,
      phaseRules: sportRules?.phaseRules ?? {},
    };
  }, [sportRules, sportId]);

  const normalizedSportId = sportId || 'beach-tennis';

  const filteredPresets = useMemo(() => {
    // 1. Presets do sistema para o esporte selecionado
    const systemForSport = allPresets.filter(
      (p) => p.isSystem && p.sportId === normalizedSportId
    );

    // Se houver presets específicos para esse esporte, usa apenas eles; senão, mostra todos do sistema
    const activeSystem =
      systemForSport.length > 0
        ? systemForSport
        : allPresets.filter((p) => p.isSystem);

    // 2. Modelos personalizados salvos pelo usuário (pertencentes a esse esporte ou sem esporte fixado)
    const customForSport = allPresets.filter(
      (p) => !p.isSystem && (!p.sportId || p.sportId === normalizedSportId)
    );

    return {
      system: activeSystem,
      custom: customForSport,
      all: [...activeSystem, ...customForSport],
    };
  }, [allPresets, normalizedSportId]);

  // Identifica se a regra padrão bate exatamente com algum preset existente para o esporte ativo
  const detectPresetId = (rules: MatchRulesConfig): string => {
    const found = filteredPresets.all.find(
      (p) =>
        p.rules.setsCount === rules.setsCount &&
        p.rules.gamesPerSet === rules.gamesPerSet &&
        p.rules.noAd === rules.noAd &&
        p.rules.tieBreak === rules.tieBreak &&
        p.rules.tieBreakAt === rules.tieBreakAt &&
        p.rules.tieBreakPoints === rules.tieBreakPoints &&
        p.rules.superTieBreakFinalSet === rules.superTieBreakFinalSet &&
        (!isPickleball || p.rules.pickleballScoringMode === rules.pickleballScoringMode)
    );
    return found ? found.id : 'custom';
  };

  const handleUpdateDefaultRules = (newRules: Partial<MatchRulesConfig>) => {
    const updated: MatchRulesConfig = {
      ...currentRules.defaultRules,
      ...newRules,
    };
    onChangeSportRules({
      ...currentRules,
      defaultRules: updated,
    });
  };

  const handleSelectDefaultPreset = (presetId: string) => {
    if (presetId === 'custom') return;
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) return;
    onChangeSportRules({
      ...currentRules,
      defaultRules: { ...preset.rules },
    });
  };

  const handleToggleCustomPhases = (enabled: boolean) => {
    onChangeSportRules({
      ...currentRules,
      customPhasesEnabled: enabled,
      phaseRules: enabled
        ? {
            groups: currentRules.phaseRules?.groups ?? { ...currentRules.defaultRules },
            playoffs: currentRules.phaseRules?.playoffs ?? { ...currentRules.defaultRules },
            semifinal: currentRules.phaseRules?.semifinal ?? { ...currentRules.defaultRules },
            final: currentRules.phaseRules?.final ?? { ...currentRules.defaultRules },
          }
        : currentRules.phaseRules,
    });
  };

  const handleSelectPhasePreset = (phaseKey: 'groups' | 'playoffs' | 'semifinal' | 'final', presetId: string) => {
    if (presetId === 'same_as_default') {
      const updatedPhaseRules = { ...currentRules.phaseRules };
      delete updatedPhaseRules[phaseKey];
      onChangeSportRules({
        ...currentRules,
        phaseRules: updatedPhaseRules,
      });
      return;
    }
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) return;
    onChangeSportRules({
      ...currentRules,
      phaseRules: {
        ...currentRules.phaseRules,
        [phaseKey]: { ...preset.rules },
      },
    });
  };

  const handleUpdatePhaseRules = (
    phaseKey: 'groups' | 'playoffs' | 'semifinal' | 'final',
    newRules: Partial<MatchRulesConfig>
  ) => {
    const base = currentRules.phaseRules?.[phaseKey] ?? currentRules.defaultRules;
    onChangeSportRules({
      ...currentRules,
      phaseRules: {
        ...currentRules.phaseRules,
        [phaseKey]: {
          ...base,
          ...newRules,
        },
      },
    });
  };

  const handleSaveAsCustomPreset = () => {
    if (!newPresetName.trim()) return;
    const desc = isPickleball
      ? `${currentRules.defaultRules.setsCount} set(s) · ${currentRules.defaultRules.gamesPerSet} pts · ${(currentRules.defaultRules.pickleballScoringMode ?? 'rally') === 'side-out' ? 'Side-out' : 'Rally'}`
      : `${currentRules.defaultRules.setsCount} set(s) · ${currentRules.defaultRules.gamesPerSet} games · TB ${currentRules.defaultRules.tieBreakAt}`;

    const newPreset: MatchRulesPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      description: desc,
      rules: { ...currentRules.defaultRules },
      sportId: sportId || 'beach-tennis',
      isSystem: false,
    };
    const updated = saveCustomPreset(newPreset);
    setAllPresets(updated);
    setNewPresetName('');
    setIsCreatingPreset(false);
  };

  const handleDeletePreset = (id: string) => {
    const updated = deleteCustomPreset(id);
    setAllPresets(updated);
  };

  // Renderizador dos controles de regras
  const renderRuleControls = (
    rules: MatchRulesConfig,
    onUpdate: (val: Partial<MatchRulesConfig>) => void,
    readOnly: boolean
  ) => {
    const defaultGameOptions = isPickleball ? [11, 15, 21] : isTennis ? [4, 6, 8] : [4, 6];
    const renderedGameOptions = Array.from(new Set([...defaultGameOptions, rules.gamesPerSet])).sort(
      (a, b) => a - b
    );
    const defaultTbAt = isTennis ? ['3-3', '4-4', '5-5', '6-6', '7-7'] : ['4-4', '5-5', '6-6'];
    const renderedTbAt = Array.from(new Set([...defaultTbAt, rules.tieBreakAt]));

    return (
      <div className="space-y-3 pt-2">
        {/* Set melhor de */}
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 h-11">
          <span className="text-xs font-black text-slate-700">Set melhor de</span>
          <div className={`flex bg-slate-100 rounded-xl p-1 gap-1 ${readOnly ? 'pointer-events-none opacity-80' : ''}`}>
            {([1, 3, 5] as const).map((num) => (
              <button
                key={num}
                type="button"
                disabled={readOnly}
                onClick={() => onUpdate({ setsCount: num })}
                className={`w-9 h-7 rounded-lg text-xs font-black transition-all ${
                  rules.setsCount === num ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Games por set / Pontos por set */}
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 h-11">
          <span className="text-xs font-black text-slate-700">
            {isPickleball ? 'Pontos por set' : 'Games por set'}
          </span>
          <div className={`flex bg-slate-100 rounded-xl p-1 gap-1 ${readOnly ? 'pointer-events-none opacity-80' : ''}`}>
            {renderedGameOptions.map((num) => (
              <button
                key={num}
                type="button"
                disabled={readOnly}
                onClick={() => onUpdate({ gamesPerSet: num })}
                className={`min-w-9 h-7 px-2 rounded-lg text-xs font-black transition-all ${
                  rules.gamesPerSet === num ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Tipo de pontuação — apenas Pickleball */}
        {isPickleball && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
            <span className="text-xs font-black text-slate-700 block">Tipo de pontuação</span>
            <div className={`grid grid-cols-2 gap-2 ${readOnly ? 'pointer-events-none opacity-80' : ''}`}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onUpdate({ pickleballScoringMode: 'side-out' })}
                className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all border flex flex-col items-center justify-center text-center ${
                  (rules.pickleballScoringMode ?? 'rally') === 'side-out'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <span>Tradicional</span>
                <span className="text-[10px] font-bold opacity-90 leading-tight">(Side-out)</span>
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onUpdate({ pickleballScoringMode: 'rally' })}
                className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all border flex flex-col items-center justify-center text-center ${
                  (rules.pickleballScoringMode ?? 'rally') === 'rally'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <span>Rally</span>
                <span className="text-[10px] font-bold opacity-90 leading-tight">(Ponto é ponto)</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {(rules.pickleballScoringMode ?? 'rally') === 'side-out'
                ? 'Só pontua quem está sacando. Duplas: terceiro saque. Simples: um saque por vez.'
                : 'Todo rally gera ponto, independente de quem saca (modo rally scoring).'}
            </p>
          </div>
        )}
        {/* Toggles: Sem vantagem e Troca de lado */}
        <div className="grid grid-cols-1 gap-2">
          {!isPickleball && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
              <Toggle
                id="toggle-no-ad"
                label="Sem vantagem (no-ad)"
                checked={rules.noAd}
                disabled={readOnly}
                onChange={(checked) => onUpdate({ noAd: checked })}
              />
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
            <Toggle
              id="toggle-switch-sides"
              label={isPickleball ? 'Troca de lado no meio do set' : 'Troca de lado no ímpar'}
              checked={rules.switchSidesOdd}
              disabled={readOnly}
              onChange={(checked) => onUpdate({ switchSidesOdd: checked })}
            />
          </div>
        </div>

        {/* Bloco Tie-break */}
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700">Habilitar tie-break</span>
            <Toggle
              id="toggle-tie-break"
              label=""
              checked={rules.tieBreak}
              disabled={readOnly}
              onChange={(checked) => onUpdate({ tieBreak: checked })}
            />
          </div>

          {rules.tieBreak && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              {/* Set: quando entra o TB */}
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 h-10">
                <span className="text-[11px] font-black text-slate-600">Set: quando</span>
                <div className={`flex bg-slate-100 rounded-lg p-0.5 gap-1 ${readOnly ? 'pointer-events-none opacity-80' : ''}`}>
                  {renderedTbAt.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onUpdate({ tieBreakAt: opt })}
                      className={`px-2.5 h-6 rounded text-[11px] font-black transition-all ${
                        rules.tieBreakAt === opt ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pontos tie-break */}
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 h-10">
                <span className="text-[11px] font-black text-slate-600">Pontos tie-break</span>
                <div className={`flex bg-slate-100 rounded-lg p-0.5 gap-1 ${readOnly ? 'pointer-events-none opacity-80' : ''}`}>
                  {([7, 10] as const).map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onUpdate({ tieBreakPoints: pts })}
                      className={`px-3 h-6 rounded text-[11px] font-black transition-all ${
                        rules.tieBreakPoints === pts ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {pts}
                    </button>
                  ))}
                </div>
              </div>

              {/* Diferença de 2 pontos */}
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5">
                <Toggle
                  id="toggle-win-by-two"
                  label="Diferença de 2 pontos"
                  checked={rules.tieBreakWinByTwo}
                  disabled={readOnly}
                  onChange={(checked) => onUpdate({ tieBreakWinByTwo: checked })}
                />
              </div>

              {/* 3º set Super Tie-break se for melhor de 3 */}
              {rules.setsCount === 3 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5">
                  <Toggle
                    id="toggle-super-tb"
                    label="3º set é super tie-break (10 pts)"
                    checked={rules.superTieBreakFinalSet ?? true}
                    disabled={readOnly}
                    onChange={(checked) => onUpdate({ superTieBreakFinalSet: checked })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const defaultPresetId = detectPresetId(currentRules.defaultRules);

  return (
    <div className="space-y-4 pt-2 border-t border-slate-100">
      {/* ── Regras Gerais do Torneio ────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-slate-500 ml-1">
            Formato padrão de partida
          </label>
          <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1">
            <Sparkles size={11} /> Regra geral do evento
          </span>
        </div>

        {/* Seletor de Modelo / Preset */}
        <select
          value={defaultPresetId}
          disabled={isReadOnly}
          onChange={(e) => handleSelectDefaultPreset(e.target.value)}
          className="w-full h-12 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-xl px-3 font-black text-xs outline-none cursor-pointer text-slate-700"
        >
          {filteredPresets.system.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.description})
            </option>
          ))}
          {filteredPresets.custom.length > 0 && (
            <optgroup label="Modelos salvos">
              {filteredPresets.custom.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.description})
                </option>
              ))}
            </optgroup>
          )}
          {defaultPresetId === 'custom' && (
            <option value="custom">⚙️ Personalizado (regras ajustadas manualmente)</option>
          )}
        </select>

        {/* Controles de Regras Padrão */}
        {renderRuleControls(currentRules.defaultRules, handleUpdateDefaultRules, isReadOnly)}

        {/* Salvar como novo modelo */}
        {!isReadOnly && (
          <div className="pt-1">
            {isCreatingPreset ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-blue-200 bg-blue-50/70">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Nome do modelo (ex: Regra de verão)"
                  className="flex-1 h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-black outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveAsCustomPreset}
                  disabled={!newPresetName.trim()}
                  className="px-3 h-9 bg-blue-600 disabled:opacity-50 text-white rounded-lg text-xs font-black flex items-center gap-1 active:scale-95"
                >
                  <Check size={14} /> Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingPreset(false)}
                  className="px-2 h-9 text-slate-500 hover:text-slate-700 text-xs font-bold"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsCreatingPreset(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  <Bookmark size={13} /> Salvar formato atual como modelo...
                </button>
                {/* Se for preset customizado, permite excluir */}
                {allPresets.some((p) => p.id === defaultPresetId && !p.isSystem) && (
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(defaultPresetId)}
                    className="text-[10px] text-red-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={11} /> Excluir modelo
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Toggle: Regras específicas por fase ─────────────────────────────── */}
      <div className="pt-3 border-t border-slate-200">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-800">Regras específicas por fase</p>
              <p className="text-[10px] text-slate-500">
                Permite variar regras (ex: tie-break diferente ou melhor de 3 na final).
              </p>
            </div>
            <Toggle
              id="toggle-custom-phases"
              label=""
              checked={currentRules.customPhasesEnabled ?? false}
              disabled={isReadOnly}
              onChange={handleToggleCustomPhases}
            />
          </div>

          {currentRules.customPhasesEnabled && (
            <div className="space-y-2.5 pt-3 border-t border-slate-100 animate-in fade-in">
              {PHASES.map((phase) => {
                const phaseRules = currentRules.phaseRules?.[phase.key];
                const activeRules = phaseRules ?? currentRules.defaultRules;
                const isUsingDefault = !phaseRules;
                const phasePresetId = isUsingDefault ? 'same_as_default' : detectPresetId(activeRules);
                const isExpanded = expandedPhaseKey === phase.key;

                return (
                  <div key={phase.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-800 block">{phase.label}</span>
                        <span className="text-[10px] text-slate-400">{phase.description}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedPhaseKey(isExpanded ? null : phase.key)}
                        className="text-[11px] font-black text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        {isExpanded ? 'Recolher detalhes' : 'Ver detalhes'}
                        <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <select
                      value={phasePresetId}
                      disabled={isReadOnly}
                      onChange={(e) => handleSelectPhasePreset(phase.key, e.target.value)}
                      className="w-full h-10 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-3 font-bold text-xs outline-none cursor-pointer text-slate-700"
                    >
                      <option value="same_as_default">
                        🔗 Usar formato padrão do evento ({currentRules.defaultRules.setsCount} set(s), {currentRules.defaultRules.gamesPerSet} {isPickleball ? 'pts' : 'games'})
                      </option>
                      {filteredPresets.system.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} ({preset.description})
                        </option>
                      ))}
                      {filteredPresets.custom.length > 0 && (
                        <optgroup label="Modelos salvos">
                          {filteredPresets.custom.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name} ({preset.description})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {!isUsingDefault && phasePresetId === 'custom' && (
                        <option value="custom">⚙️ Personalizado para esta fase</option>
                      )}
                    </select>

                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-200 animate-in fade-in">
                        {renderRuleControls(
                          activeRules,
                          (val) => handleUpdatePhaseRules(phase.key, val),
                          isReadOnly
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
