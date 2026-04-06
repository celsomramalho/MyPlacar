type: feature
lastUpdated: [[YYYY-MM-DD]]
tags: [feature, [nome-da-feature], [modulo]]
---

# 🚀 Feature: [Nome da Feature]

## 📌 Resumo
[Descreva brevemente a funcionalidade, seu propósito e o valor que ela agrega ao aplicativo. Máximo 2 parágrafos.]

## 🎯 Objetivo
[Qual problema esta feature resolve? Quais são os resultados esperados e os critérios de sucesso?]

## 📈 Status Atual
**Prioridade:** [alta | média | baixa]
**Responsável:** [Nome do Desenvolvedor/Equipe]

## 🔧 Implementação Técnica

### Componentes Envolvidos
- [Liste os principais componentes, módulos ou arquivos que esta feature afeta ou utiliza. Ex: `src/components/Scoreboard.tsx`, `src/hooks/useVoiceRecognition.ts`.]
- [Componente A]
- [Componente B]

### Fluxo de Dados
[Descreva o fluxo de dados da feature. Use um diagrama Mermaid para visualização, se aplicável.]

```mermaid
graph TD
    A[Usuário Interage] --> B{Lógica da Feature};
    B --> C[Atualiza Estado/Dados];
    C --> D[Renderiza UI];
    D --> E[Persiste no Backend];

### Código Exemplo
[Forneça snippets de código relevantes para a feature, como um hook, uma função utilitária ou um trecho de componente. Especifique a linguagem.]

```typescript
// Exemplo: src/hooks/useFeatureName.ts
import { useState, useEffect } from 'react';

export function useFeatureName(initialValue: string) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    // Lógica da feature aqui
    console.log('Feature [Nome da Feature] inicializada com:', value);
  }, [value]);

  const updateValue = (newValue: string) => {
    setValue(newValue);
  };

  return { value, updateValue };
}
```

### Considerações de Performance/Segurança
[Quais são os pontos críticos de performance? Há alguma preocupação de segurança específica para esta feature?]

## 🧪 Como Testar
[Liste os passos para testar a funcionalidade, incluindo casos de sucesso e falha.]
- [ ] **Cenário 1:** [Descrição do cenário de teste]
    - [ ] Passo 1: [Ação]
    - [ ] Passo 2: [Resultado esperado]
- [ ] **Cenário 2:** [Descrição do cenário de teste]
    - [ ] Passo 1: [Ação]
    - [ ] Passo 2: [Resultado esperado]

## 🔗 Referências
- [[ADR-XXX: Decisão sobre [Nome da Feature]]]
- [[API/Dados: [Nome da Coleção/Endpoint]]]
- [Link para o Figma/Wireframes](https://link-do-figma.com)
- [Link para a Issue no GitHub/Jira](https://link-da-issue.com)

#feature #[nome-da-feature]
```