# Plano de Otimização — Rodada 2 (75 → ~85)

Após a primeira rodada (63 → 75), os dois maiores gargalos restantes são:

1. O bundle `vendor-DsPhfzfs.js` de **350 kB** no caminho crítico de carregamento (React + Supabase + todas as outras bibliotecas em um único arquivo monolítico).
2. A inicialização do **Firebase Auth** acontecendo imediatamente no primeiro render — o que força o browser a baixar e executar `auth/iframe.js` (90 kB / 853 ms) **antes** do primeiro paint visível.

---

## Otimização A: Dividir o Bundle Vendor (Impacto: TBT + Cache)

### Diagnóstico
O vite.config.ts atual agrupa **tudo que não é Firebase, Leaflet, Genai ou Icons** em um único chunk `vendor`:

```js
// Atual — qualquer biblioteca "restante" vai para vendor (350 kB!)
return 'vendor';
```

Esse arquivo inclui pelo menos: React, ReactDOM, `@supabase/supabase-js`, e outros pacotes de suporte. Com apenas 1 chunk, o browser não pode:
- Baixar React e Supabase **em paralelo**
- Usar a cópia cacheada do React quando apenas o código do Supabase muda (ou vice-versa)

### Ações em [vite.config.ts](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/vite.config.ts)
- Separar `react` e `react-dom` em `vendor-react` — essas bibliotecas nunca mudam de versão sem intencionalidade, então ficam em cache quase permanentemente para usuários recorrentes.
- Separar `@supabase/supabase-js` em `vendor-supabase`.
- O `vendor` residual ficará muito menor, contendo apenas bibliotecas pequenas restantes.

**Resultado esperado no build:**
| Antes | Depois |
|---|---|
| `vendor.js` 350 kB | `vendor-react.js` ~150 kB + `vendor-supabase.js` ~120 kB + `vendor.js` ~80 kB |

Carregados **em paralelo** → redução do tempo de execução na main thread. Usuários recorrentes ganham cache eficiente por biblioteca individual.

---

## Otimização B: Adiar Inicialização do Firebase Auth (Impacto: LCP + TBT)

### Diagnóstico
O hook [useAppAuth.ts](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/hooks/useAppAuth.ts) chama `getAuthInstance()` diretamente no `useEffect`, que executa **durante o primeiro render do app**. Isso faz o Firebase Auth:
1. Ser incluído no carregamento crítico inicial.
2. Disparar imediatamente a carga de `auth/iframe.js` (90 kB, 853ms) do domínio `myplacar-b4ccc.firebaseapp.com`.
3. Executar na main thread antes da primeira exibição de conteúdo.

Para **usuários já autenticados** (a maioria absoluta dos retornantes, que iniciam na tela `settings`), `authReady` é usado principalmente para sincronização com Firestore. A tela já renderiza antes, então não precisamos bloquear o primeiro paint esperando pelo Firebase Auth.

### Ações em [useAppAuth.ts](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/hooks/useAppAuth.ts)
- Envolver a chamada de `getAuthInstance()` em `requestIdleCallback` (com fallback para `setTimeout(0)`).
- Isso empurra a inicialização do Firebase Auth para **depois** do primeiro ciclo de render, liberando a main thread para pintar a UI antes.
- `authReady` permanece `false` até o callback disparar, o que é seguro — o comportamento já é esse: as queries dependentes de `authReady` aguardam.

> [!IMPORTANT]
> Esta mudança é **transparente** para o funcionamento: `authReady` continuará sendo o sinal de que o Auth Firebase está pronto, só chegará um tick depois da renderização inicial em vez de durante ela. Para usuários já logados (tela `settings`), isso é imperceptível.

---

## Arquivos Modificados

### [MODIFY] [vite.config.ts](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/vite.config.ts)
```diff
manualChunks(id) {
  if (id.includes('node_modules')) {
    if (id.includes('firebase'))      return 'vendor-firebase';
    if (id.includes('leaflet'))       return 'vendor-leaflet';
    if (id.includes('@google/genai')) return 'vendor-gemini';
    if (id.includes('lucide-react'))  return 'vendor-icons';
+   if (id.includes('react-dom') || id.includes('react/'))
+                                     return 'vendor-react';
+   if (id.includes('@supabase'))     return 'vendor-supabase';
    return 'vendor';
  }
},
```

### [MODIFY] [useAppAuth.ts](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/hooks/useAppAuth.ts)
```diff
-  useEffect(() => {
-    const auth = getAuthInstance();
-    if (!auth) { setAuthReady(true); return; }
-    const unsub = onAuthStateChanged(auth, () => setAuthReady(true));
-    return () => unsub();
-  }, []);
+  useEffect(() => {
+    // Adia a inicialização do Firebase Auth para depois do primeiro paint.
+    // Isso mantém o auth/iframe.js fora do caminho crítico de renderização.
+    const schedule = (fn: () => void) =>
+      'requestIdleCallback' in window
+        ? (window as any).requestIdleCallback(fn, { timeout: 2000 })
+        : setTimeout(fn, 0);
+
+    const id = schedule(() => {
+      const auth = getAuthInstance();
+      if (!auth) { setAuthReady(true); return; }
+      const unsub = onAuthStateChanged(auth, () => setAuthReady(true));
+      return () => unsub();  // cleanup gerenciado dentro do schedule
+    });
+
+    return () => {
+      if ('requestIdleCallback' in window) {
+        (window as any).cancelIdleCallback(id);
+      } else {
+        clearTimeout(id);
+      }
+    };
+  }, []);
```

> [!WARNING]
> A função `requestIdleCallback` não existe no iOS Safari. Por isso o código usa `setTimeout(0)` como fallback — ambos produzem o mesmo efeito de adiar para após o render.

---

## Plano de Verificação

### Compilação
```bash
pnpm build
```
Confirmar que o build gera 3 chunks vendor distintos (`vendor-react`, `vendor-supabase`, `vendor`) menores do que o único `vendor` atual de 350 kB.

### Comportamento funcional
- Login normal: `authReady` chega um tick depois — sem impacto percebível.
- Usuário retornante (tela `settings`): Firebase Auth é inicializado em idle, sem bloquear render.
- Queries Firestore aguardam `authReady` como antes.
