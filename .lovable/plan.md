# Atalho do app + serviços que não ocupam a agenda

## 1. Botão "Criar atalho" que não faz nada

Hoje o app não tem o arquivo que o navegador exige para oferecer a instalação, então o botão nunca recebe o convite nativo e o clique fica sem efeito.

O que muda:
- Passa a existir esse arquivo (service worker simples, apenas para habilitar a instalação, sem cache agressivo) registrado quando o app abre.
- Quando o navegador oferecer a instalação, o clique abre a janela nativa "Instalar Agendou Pro".
- Quando o navegador não oferecer (iPhone, ou app aberto dentro do editor), o clique passa a mostrar o passo a passo do aparelho e um aviso claro, em vez de não fazer nada.
- Mesmo comportamento no botão em Configurações.

## 2. Serviços que podem ser feitos em paralelo (ex: progressiva)

Cada serviço ganha uma opção: **"Permite atendimento simultâneo"**.

- Quando ligada, um agendamento só desse tipo de serviço **não bloqueia** nenhum horário do profissional: os horários continuam livres para outros clientes.
- Quando o cliente escolhe um serviço desses junto com um serviço normal, o horário volta a ser bloqueado (há trabalho contínuo do profissional).
- A página de reservas mostra um aviso no serviço: "durante parte deste atendimento o profissional poderá atender outro cliente".
- Na agenda do dia esses atendimentos aparecem com uma marca "simultâneo", para o dono entender por que dois clientes estão no mesmo horário.
- Configuração fica em Serviços (mesma regra de plano das outras edições).

## Detalhes técnicos

- `public/sw.js` mínimo (`install`/`activate`/`fetch` pass-through) + registro em `src/routes/__root.tsx` (client-only). `InstallAppDialog`/Configurações: no retorno `unsupported`, exibir instruções + toast informativo.
- Migração: `services.allows_parallel boolean not null default false`; `appointments.blocks_agenda boolean not null default true`.
- Criação do agendamento (`src/lib/booking.functions.ts` / `appointments.functions.ts`): `blocks_agenda = false` somente quando todos os serviços escolhidos têm `allows_parallel = true`.
- `prevent_double_booking()`: ignorar conflito quando o novo registro ou o existente tem `blocks_agenda = false`.
- `busyIntervals` (`src/lib/booking.server.ts`) e a RPC `public_busy`: filtrar `blocks_agenda = true`.
- RPC `public_catalog`: expor `allows_parallel` por serviço; `$slug.tsx` mostra o aviso.
- Toggle em `app.servicos.tsx`; badge em `app.index.tsx`.
- Testes de `computeSlots` continuam válidos (a mudança é no que entra como "ocupado").
