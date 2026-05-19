#!/usr/bin/env python3
"""Passo 13 Fase 2: remove bridges/mirrors from App.tsx."""
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "src" / "App.tsx"
text = APP.read_text(encoding="utf-8")

text = text.replace(
    "import { LiveProvider, useLive } from '@modules/live';\n"
    "import { GameProvider, useGame } from '@modules/game';",
    "import { useLive } from '@modules/live';\n"
    "import { useGame } from '@modules/game';\n"
    "import { GameLiveProviderStack } from './app/GameLiveProviderStack.tsx';",
)
text = text.replace("const AppInner: React.FC = () => {", "const AppContent: React.FC = () => {")
text = text.replace("// ─── AppInner ─", "// ─── AppContent ─")
text = text.replace("<AppInner />", "<AppContent />")

for old, new in [
    ("ctxSetActiveLives", "setActiveLives"),
    ("ctxSetCloudLiveExists", "setCloudLiveExists"),
    ("ctxSetLiveLogs", "setLiveLogs"),
    ("ctxSetFbSyncStatus", "setFbSyncStatus"),
    ("ctxTookControlAtRef", "tookControlAtRef"),
    ("ctxLostControlAtRef", "lostControlAtRef"),
    ("ctxIsClosingLiveRef", "isClosingLiveRef"),
    ("ctxLastFbScoreKeyRef", "lastFbScoreKeyRef"),
    ("ctxFbSyncTimerRef", "fbSyncTimerRef"),
    ("ctxHasAutoEnabledScoreboardRef", "hasAutoEnabledScoreboardRef"),
]:
    text = text.replace(old, new)

start_marker = "  } = useUI();\n\n  // Mantém a tela acesa"
end_marker = "  const currentFullDeviceName = useMemo(() => {"
start, end = text.find(start_marker), text.find(end_marker)
if start < 0 or end < 0:
    raise SystemExit(f"hook markers missing start={start} end={end}")

hooks_block = """  } = useUI();

  const {
    userProfile,
    setUserProfile,
    partners,
    setPartners,
    matchSettings,
    setMatchSettings,
    gameState,
    setGameState,
    gameStateRef,
    matchHistory,
    setMatchHistory,
    matchHistoryRef,
    persistHistory,
    handleLeaveLive,
    finalizeMatchInternal,
    handleCloseCloudLive,
    handleDeleteJudge,
    handleControlLive,
    handleObserveLive,
    handleSyncScoreboard,
    handleAddJudge,
    handleSaveProfile,
    handleScoreUpdate,
    handleCorrectScore,
    handleUndo,
    startGame,
    handleResetMatch,
    initGameState,
    handleExportData,
    canStartMatch,
  } = useGame();

  const {
    activeLives,
    setActiveLives,
    cloudLiveExists,
    setCloudLiveExists,
    fbSyncStatus,
    setFbSyncStatus,
    activeLivesRef,
    tookControlAtRef,
    lostControlAtRef,
    isClosingLiveRef,
    lastFbScoreKeyRef,
    fbSyncTimerRef,
    hasAutoEnabledScoreboardRef,
    isOriginalOwner,
    isActiveController,
    isCurrentController,
    isCommandOwner,
    livePapel,
    liveStatus,
    indicatorRole,
    isJudgeOnline,
    isOwnerOnline,
    resolveTargetPin,
  } = useLive();

  // Mantém a tela acesa"""

text = text[:start] + hooks_block + text[end:]

mh_start = "  // ── matchHistory — espelho do GameContext ─"
mh_end = "  const [activeTab, setActiveTab] = useState<Tab>('config');"
s, e = text.find(mh_start), text.find(mh_end)
if s >= 0 and e >= 0:
    text = text[:s] + text[e:]

proxy_start = "  // ── matchHistoryRef — proxy para o ref do GameContext ─"
proxy_end = "  const prevSettingsRef = useRef<MatchSettings | null>(null);"
s, e = text.find(proxy_start), text.find(proxy_end)
if s >= 0 and e >= 0:
    text = text[:s] + text[e:]

text = text.replace(
    "  const ctxPersistHistoryRef = useRef<(newList: MatchHistoryItem[]) => void>(() => {});\n"
    "  const persistHistory = useCallback((newList: MatchHistoryItem[]) => {\n"
    "    ctxPersistHistoryRef.current(newList);\n"
    "  }, []);\n\n",
    "",
)

# Remove provider wrapper + bridges from return
bridge_block_start = "  return (\n      <LiveProvider"
div_marker = '      <div className="min-h-screen w-full bg-gray-50 flex flex-col">'
bs = text.find(bridge_block_start)
bd = text.find(div_marker, bs)
if bs < 0 or bd < 0:
    raise SystemExit(f"return block markers missing bs={bs} bd={bd}")
text = text[:bs] + "  return (\n" + text[bd:]

# Remove closing GameProvider/LiveProvider before );
text = text.replace(
    "    </motion/div>\n      </GameProvider>\n      </LiveProvider>\n  );",
    "    </motion/div>\n  );",
)
text = text.replace(
    "    </div>\n      </GameProvider>\n      </LiveProvider>\n  );",
    "    </div>\n  );",
)

# Remove GameBridge and LiveBridge components
gb_start = "\n// ─── GameBridge ─"
app_root = "\n// ─── App (root mínimo) ─"
gs, gr = text.find(gb_start), text.find(app_root)
if gs >= 0 and gr >= 0:
    text = text[:gs] + text[gr:]

text = text.replace(
    "// Só monta o ErrorBoundary e o AppInner. O <LiveProvider> está dentro do\n"
    "// AppInner para que os estados (gameState, userProfile, etc.) já existam\n"
    "// quando o provider for montado.\n"
    "const App: React.FC = () => (\n"
    "  <ErrorBoundary>\n"
    "    <UIProvider initialScreen={getInitialScreen()}>\n"
    "      <AppInner />\n"
    "    </UIProvider>\n"
    "  </ErrorBoundary>\n"
    ");",
    "// Orquestrador: UI → Live+Game (GameLiveProviderStack) → AppContent\n"
    "const App: React.FC = () => (\n"
    "  <ErrorBoundary>\n"
    "    <UIProvider initialScreen={getInitialScreen()}>\n"
    "      <GameLiveProviderStack>\n"
    "        <AppContent />\n"
    "      </GameLiveProviderStack>\n"
    "    </UIProvider>\n"
    "  </ErrorBoundary>\n"
    ");",
)

APP.write_text(text, encoding="utf-8")
print("OK:", APP, "lines:", text.count("\n") + 1)
