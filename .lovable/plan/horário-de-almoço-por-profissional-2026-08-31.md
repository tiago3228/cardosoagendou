# Horário de Almoço por Profissional

## Objetivo

Permitir que cada profissional tenha um intervalo de almoço configurado por dia da semana, junto aos horários de trabalho. Esse intervalo bloqueia automaticamente os horários oferecidos na página pública de agendamento.

## O que será feito

### 1. Banco de dados (migração)

- Adicionar duas colunas opcionais em `professional_hours`:
  - `lunch_starts_at` (hora de início do almoço, ex.: 12:00)
  - `lunch_ends_at` (hora de fim do almoço, ex.: 13:00)
- Ambas podem ficar vazias (sem almoço = comportamento atual, nada muda para quem não configurar).
- Atualizar a função `public_catalog` para incluir os novos campos nos horários de profissionais expostos à página pública.

### 2. Tela de Equipe (`/app/profissionais`)

- No editor de horários de cada dia da semana, adicionar dois campos "Almoço: das __ às __" ao lado do horário de trabalho.
- Salvar/carregar junto com o horário do dia (mesma operação de salvar já existente).
- Se os campos ficarem vazios, nenhum intervalo é aplicado.

### 3. Motor de disponibilidade

- `src/lib/booking.server.ts`: ler o intervalo de almoço do dia e repassar ao cálculo de horários.
- `src/lib/availability.ts`: tratar o almoço como um período ocupado — nenhum horário de atendimento poderá começar ou terminar dentro do intervalo (ex.: serviço de 60min às 11:30 com almoço 12:00–13:00 não é oferecido).
- Atualizar o fallback em `src/lib/booking.functions.ts` para incluir os novos campos.

### 4. Validação

- Almoço só é considerado se início < fim e estiver dentro do expediente do dia.
- Verificação visual na página pública de agendamento: horários dentro do almoço não aparecem.

## Fora de escopo

- Sem mudanças visuais além dos dois campos novos no editor de horários.
- Sem intervalo de almoço para o estabelecimento (somente por profissional).
- Sem alterar agendamentos já existentes.
