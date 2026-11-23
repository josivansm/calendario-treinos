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
- **Biblioteca de treinos**: modelos prontos para arrastar até o calendário; qualquer treino pode virar modelo.
- **Zonas por atleta**: pace de limiar (corrida), FTP (ciclismo), CSS (natação) e FC máxima. Cada treino mostra o
  alvo da zona escolhida (pace, watts, bpm), inclusive no link da atleta e na imagem exportada.
- **Como foi o treino**: marcar como feito, com tempo e distância realizados, esforço percebido (1–10) e comentário.
  Treinos passados não feitos ficam destacados.
- **Retorno da atleta**: pelo link, ela marca os treinos feitos (salvo no navegador dela) e toca em
  *Enviar retorno ao treinador*. Ao abrir esse link de retorno, o treinador confere e aplica no calendário.
- Backup e importação dos dados em `.json`.

## Nuvem (opcional)

Com o Supabase configurado (veja [supabase/COMO-CONFIGURAR.md](supabase/COMO-CONFIGURAR.md)):

- O treinador entra com email e senha e os treinos ficam salvos na conta.
- A atleta recebe um **convite**, cria a conta dela e vê o plano sempre atualizado,
  marcando os treinos feitos direto no site.
- As regras de acesso ficam no próprio banco ([supabase/schema.sql](supabase/schema.sql)):
  cada treinador só vê as atletas dele; a atleta só lê o plano dela e só registra "como foi".

Sem a nuvem configurada, o site funciona como abaixo.

## Onde ficam os dados (sem nuvem)

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
