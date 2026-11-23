# Calendário de Treinos

Calendário de treinos de **corrida, ciclismo e natação**, inspirado no TrainingPeaks.
Site estático (HTML, CSS e JavaScript puro), sem servidor e sem login — roda no GitHub Pages.

## O que dá para fazer

- Montar treinos por dia: modalidade, duração, distância, intensidade (Z1–Z5), estrutura e observações.
- Arrastar treinos entre dias (segure **Ctrl** ao soltar para copiar), duplicar, copiar e colar semanas inteiras.
- Resumo semanal com tempo total e volume por modalidade.
- Vários atletas no mesmo calendário.
- **Exportar imagem (PNG)** da semana, da próxima semana, do mês ou de um período livre, em formato
  lista (bom para celular) ou calendário (grade, bom para imprimir).
- **Link da atleta**: gera um link somente leitura com o plano dentro do próprio link para ela abrir no celular.
- Backup e importação dos dados em `.json`.

## Onde ficam os dados

Os treinos ficam salvos **no navegador de quem monta o plano** (localStorage). Faça backup de vez em quando
pelo menu `⋯ → Baixar backup`. O link da atleta leva uma cópia do plano daquele momento: se mudar os treinos,
gere e envie um link novo.

## Rodar localmente

Qualquer servidor estático serve, por exemplo:

```
npx serve .
```

## Publicar

Em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`.
