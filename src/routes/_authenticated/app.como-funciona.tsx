import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ExternalLink,
  MessageCircle,
  Package,
  Scissors,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/como-funciona")({
  component: HowItWorksPage,
});

type GuideStep = {
  title: string;
  description: string;
  details: string[];
  to?: string;
  action?: string;
};

type GuideSection = {
  icon: typeof Scissors;
  title: string;
  intro: string;
  steps: GuideStep[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: Scissors,
    title: "1. Cadastre seus serviços",
    intro: "Monte o catálogo que seus clientes vão encontrar na página pública de agendamento.",
    steps: [
      {
        title: "Abra Serviços",
        description: "No menu lateral, acesse Serviços.",
        details: ["Clique em Novo serviço ou use o formulário de cadastro."],
        to: "/app/servicos",
        action: "Ir para Serviços",
      },
      {
        title: "Selecione o segmento desejado",
        description: "Abra Catálogo de segmentos e escolha o segmento do seu negócio.",
        details: [
          "Você pode escolher Barbearia, Depilação, Quadra, Drone, Videomaker e outros.",
          "Clique em Ativar para adicionar o segmento ao seu negócio.",
          "Expanda o segmento, marque os serviços desejados e clique em Adicionar selecionados.",
        ],
      },
      {
        title: "Revise preço e duração",
        description: "Cada serviço pode ter preço, duração, descrição e regras próprias.",
        details: [
          "Edite o serviço depois de adicioná-lo ao seu catálogo.",
          "A duração é usada para calcular os horários disponíveis.",
          "Use descrição para explicar ao cliente o que está incluído.",
        ],
      },
      {
        title: "Crie pacotes",
        description: "Combine vários serviços em um pacote para venda.",
        details: ["Selecione os serviços componentes, defina nome, preço e descrição do pacote."],
      },
    ],
  },
  {
    icon: Users,
    title: "2. Cadastre sua equipe",
    intro: "Associe profissionais aos serviços que eles realizam.",
    steps: [
      {
        title: "Acesse Equipe",
        description: "Cadastre cada profissional do estabelecimento.",
        details: ["Informe nome, contato e dados profissionais."],
        to: "/app/profissionais",
        action: "Ir para Equipe",
      },
      {
        title: "Vincule serviços ao profissional",
        description: "Marque quais serviços cada profissional pode atender.",
        details: ["O cliente só verá profissionais compatíveis com o serviço escolhido."],
      },
      {
        title: "Configure os horários",
        description: "Defina os dias, expediente, intervalos e almoço de cada profissional.",
        details: [
          "Salve as alterações de horário.",
          "A disponibilidade pública considera o horário do estabelecimento, do profissional, a duração do serviço e os intervalos.",
        ],
      },
    ],
  },
  {
    icon: CalendarDays,
    title: "3. Configure sua agenda",
    intro: "A agenda organiza reservas, confirmações e atendimento do dia.",
    steps: [
      {
        title: "Acompanhe novos agendamentos",
        description: "Acesse Agenda para visualizar os horários recebidos.",
        details: [
          "A tela é atualizada periodicamente.",
          "Novos agendamentos aparecem como pendentes.",
          "Você pode confirmar, cancelar, concluir ou registrar a presença.",
        ],
        to: "/app",
        action: "Ir para Agenda",
      },
      {
        title: "Confirme o atendimento",
        description: "Ao confirmar, o cliente recebe a atualização do status no link seguro.",
        details: ["Use a ação do WhatsApp para abrir uma mensagem pronta quando necessário."],
      },
      {
        title: "Conclua o atendimento",
        description: "Depois do serviço, marque o agendamento como concluído.",
        details: ["O registro passa a compor o histórico e os relatórios do negócio."],
      },
    ],
  },
  {
    icon: CalendarCheck,
    title: "4. Compartilhe sua página pública",
    intro: "Seu cliente agenda sem precisar criar uma conta no Agendou.",
    steps: [
      {
        title: "Copie o link de reservas",
        description: "Na área de agenda, encontre Sua página de reservas.",
        details: [
          "Copie apenas o link ou copie a mensagem completa de divulgação.",
          "Compartilhe no WhatsApp, Instagram, Google, bio e redes sociais.",
        ],
      },
      {
        title: "Como o cliente agenda",
        description: "O fluxo público segue uma sequência simples.",
        details: [
          "Serviço → profissional → data → horário → dados do cliente → políticas → confirmação.",
          "O horário é bloqueado conforme as regras do serviço e da equipe.",
        ],
      },
    ],
  },
  {
    icon: MessageCircle,
    title: "5. Use o WhatsApp",
    intro: "Facilite a comunicação sem exigir configuração técnica.",
    steps: [
      {
        title: "Cadastre o WhatsApp do estabelecimento",
        description: "Acesse Ajustes e informe o número do negócio.",
        details: ["O Agendou normaliza o número e cria links oficiais do WhatsApp."],
        to: "/app/configuracoes",
        action: "Ir para Ajustes",
      },
      {
        title: "Envie confirmações e mensagens",
        description: "Na agenda, abra o WhatsApp com uma mensagem preenchida.",
        details: [
          "A mensagem inclui estabelecimento, cliente, serviço, profissional, data, horário e link seguro.",
          "O modo básico abre o WhatsApp para você revisar e enviar; ele não simula envio automático.",
        ],
      },
    ],
  },
  {
    icon: Package,
    title: "6. Cadastre produtos e estoque",
    intro: "Controle produtos vendidos junto dos atendimentos.",
    steps: [
      {
        title: "Cadastre produtos",
        description: "Informe nome, preço, foto e estoque inicial.",
        details: ["Use a tela Produtos para editar itens já cadastrados."],
        to: "/app/produtos",
        action: "Ir para Produtos",
      },
      {
        title: "Registre a venda",
        description: "O estoque é alterado quando o proprietário registra ou conclui a venda.",
        details: ["Agendamento, cancelamento e reagendamento não baixam estoque automaticamente."],
      },
    ],
  },
  {
    icon: Wallet,
    title: "7. Acompanhe o financeiro",
    intro: "Consulte receitas, despesas, pagamentos e indicadores do negócio.",
    steps: [
      {
        title: "Acesse Faturamento",
        description: "Use filtros por período para acompanhar o movimento.",
        details: [
          "Registre entradas, despesas e pagamentos conforme a operação do estabelecimento.",
        ],
        to: "/app/faturamento",
        action: "Ir para Faturamento",
      },
      {
        title: "Confira relatórios e comissões",
        description: "Use os dados de atendimentos concluídos para acompanhar o desempenho.",
        details: ["As permissões e recursos disponíveis dependem do plano e do período de teste."],
      },
    ],
  },
  {
    icon: Settings,
    title: "8. Ajuste as configurações",
    intro: "Personalize a operação do estabelecimento.",
    steps: [
      {
        title: "Informações do negócio",
        description: "Mantenha nome, endereço, telefone, redes sociais e WhatsApp atualizados.",
        details: ["Essas informações podem aparecer na página pública e nas mensagens."],
      },
      {
        title: "Políticas e notificações",
        description: "Configure aceite de políticas, cancelamento, reagendamento e lembretes.",
        details: ["As regras são aplicadas ao fluxo público e aos links seguros de gerenciamento."],
      },
      {
        title: "Escolha o tema",
        description: "Use o seletor Escuro/Clean no topo do painel.",
        details: ["O tema Clean permanece como opção padrão do produto."],
      },
    ],
  },
  {
    icon: CreditCard,
    title: "9. Consulte seu plano",
    intro: "Veja os recursos, limites e status da sua assinatura.",
    steps: [
      {
        title: "Acesse Assinatura",
        description: "Compare os planos e consulte o período de teste.",
        details: [
          "O trial de 30 dias libera todos os recursos conforme as regras atuais do produto.",
        ],
        to: "/app/assinatura",
        action: "Ver Assinatura",
      },
    ],
  },
];

function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <BackButton />
      <header className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 md:p-8">
        <div className="flex items-start gap-4">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CircleHelp className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Central do proprietário
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
              Como funciona o Agendou
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Siga este passo a passo para configurar seu negócio, publicar sua página de reservas e
              começar a receber agendamentos.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Configure", "Serviços, equipe e horários"],
            ["2", "Compartilhe", "Seu link público"],
            ["3", "Atenda", "Confirme e conclua"],
          ].map(([number, title, text]) => (
            <div key={number} className="rounded-xl border border-border bg-card p-3">
              <span className="text-lg font-bold text-primary">{number}</span>
              <p className="font-semibold text-card-foreground">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="mt-6 space-y-5">
        {GUIDE_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <section
              key={section.title}
              className="rounded-2xl border border-border bg-card p-5 md:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold text-card-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{section.intro}</p>
                </div>
              </div>
              <ol className="mt-5 space-y-3 border-l-2 border-primary/20 pl-5">
                {section.steps.map((step, index) => (
                  <li
                    key={step.title}
                    className="relative rounded-xl border border-border/80 bg-background/50 p-4"
                  >
                    <span className="absolute -left-[2.05rem] top-4 inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <h3 className="font-semibold text-card-foreground">{step.title}</h3>
                    <p className="mt-1 text-sm text-foreground">{step.description}</p>
                    <ul className="mt-2 space-y-1">
                      {step.details.map((detail) => (
                        <li key={detail} className="flex gap-2 text-sm text-muted-foreground">
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-primary"
                            aria-hidden
                          />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                    {step.to && step.action ? (
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link to={step.to}>
                          {step.action} <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      <footer className="my-8 rounded-2xl border border-border bg-secondary/40 p-5 text-center">
        <p className="font-semibold text-card-foreground">Pronto para começar?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure seus serviços primeiro e depois compartilhe sua página pública.
        </p>
        <Button asChild className="mt-4">
          <Link to="/app/servicos">
            Começar pelos Serviços <ChevronRight className="size-4" />
          </Link>
        </Button>
      </footer>
    </div>
  );
}
