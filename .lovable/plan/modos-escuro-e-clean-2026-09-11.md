# Modos Escuro e Clean

## Objetivo

Permitir alternar todo o painel autenticado entre o visual escuro atual e uma aparência clara, limpa e profissional.

## Implementação

- Manter o modo Escuro atual como padrão.
- Criar uma variação Clean clara usando os mesmos elementos, hierarquia e cores de situação da agenda.
- Adicionar no topo um seletor compacto Escuro/Clean, acessível no computador e celular.
- Salvar a preferência neste navegador para mantê-la nos próximos acessos.
- Preservar todas as funcionalidades e o visual das páginas públicas.

## Detalhes técnicos

- Aplicar o tema no contêiner compartilhado do painel autenticado.
- Definir as cores Clean como tokens semânticos, sem alterar cada página separadamente.
- Ler a preferência somente após a página carregar para evitar inconsistências de exibição.
- Validar a compilação e conferir os dois modos no painel.
