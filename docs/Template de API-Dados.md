type: api-data 
resource: "[nome-da-colecao-ou-endpoint]"
version: "v1"
lastUpdated: [[YYYY-MM-DD]]
tags: [api, data, firestore, [modulo]]
---

# 🗄️ API/Dados: [Nome da Coleção/Endpoint]

## 📌 Descrição
[Descreva o propósito desta coleção do Firestore ou endpoint da API. O que ela armazena/retorna e para que é usada?]

## 📊 Estrutura de Campos
[Use uma tabela para detalhar cada campo da coleção/endpoint.]

| `name`      | `string`  | Nome do recurso (ex: nome do time, nome do evento)| Sim         | `Time A`         |
| `createdAt` | `Timestamp` | Data de criação do registro                       | Sim         | `Timestamp(1678886400, 0)` |

## 📝 Exemplos JSON
[Forneça um ou mais exemplos de como os dados são estruturados em JSON.]

```json
// Exemplo de documento na coleção 'matches'
{
  "id": "match_xyz123",
  "teamA": {
    "name": "Tubarões",
    "score": 25
  },
  "teamB": {
    "name": "Falcões",
    "score": 18
  },
  "sport": "Basquete",
  "status": "finished",
  "createdAt": "2026-03-28T10:00:00Z",
  "updatedAt": "2026-03-28T11:30:00Z"
}
```

## 🔍 Query Examples (Firestore)
[Mostre exemplos de como consultar esta coleção no Firestore.]

```typescript
// Exemplo: Buscar todas as partidas finalizadas de Basquete
import { collection, query, where, getDocs } from "firebase/firestore";

const matchesRef = collection(db, "matches");
const q = query(matchesRef, 
  where("sport", "==", "Basquete"),
  where("status", "==", "finished")
);

const querySnapshot = await getDocs(q);
querySnapshot.forEach((doc) => {
  console.log(doc.id, " => ", doc.data());
});
```

## 🔑 Índices Recomendados (Firestore)
[Liste os índices que devem ser criados no Firestore para otimizar as queries.]
- `sport` ASC, `status` ASC
- `createdAt` DESC
- `teamA.score` DESC

## ✅ Validações e Regras de Segurança (Firestore)
[Descreva as regras de validação ou segurança aplicadas a esta coleção/endpoint.]
- **Validação:** `score` deve ser um número inteiro não negativo.
- **Regra de Segurança:** Apenas usuários autenticados podem criar/atualizar documentos. Apenas administradores podem deletar.

## 🔗 Referências
- [[Data Models.md]]
- [[Firebase Setup.md]]
- [Link para a documentação da API externa (se houver)](https://api.example.com/docs)

#api #data #[modulo]
```