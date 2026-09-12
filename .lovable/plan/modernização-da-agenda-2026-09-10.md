# Modernização da Agenda

## Objetivo

Transformar a Agenda em um painel noturno profissional, preservando as ações atuais e adicionando uma visão semanal realmente utilizável.

## Implementação

- Aplicar a paleta noite premium e a tipografia Sora + Manrope somente ao painel autenticado.
- Reorganizar o topo com título, navegação de data, seletor Dia/Semana e legenda completa de sete situações.
- Manter a visão diária como lista cronológica, com faixa colorida, status por extenso, cliente, serviço, profissional, duração, valor e ações.
- Criar a visão semanal em sete colunas, com atendimentos compactos, faixa colorida e status por extenso.
- Exibir um resumo contextual dos atendimentos e adaptar controles, legenda e cartões para telas menores.
- Preservar filtros, receitas, link público, WhatsApp e mudanças de situação já existentes.

## Detalhes técnicos

- Usar a consulta atual da agenda com intervalos de um dia ou sete dias.
- Centralizar rótulos e estilos das situações para que dia, semana e legenda usem a mesma fonte de verdade.
- Representar o fluxo atual com: PENDING = Agendado, CONFIRMED = Confirmado, IN_PROGRESS = Aguardando, COMPLETED = Atendido, CANCELED = Cancelado, NO_SHOW = Faltou e RESCHEDULED = Reagendado.
- Definir novas cores como tokens semânticos no tema global, sem valores visuais soltos na página.
- Validar a compilação e conferir a agenda em desktop e celular.
