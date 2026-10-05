import { createFileRoute, Link } from "@tanstack/react-router";
import { EMPRESA } from "@/config/empresa";
import { Lista, PaginaLegal, Secao } from "@/components/legal/PaginaLegal";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Planeta97 NEXO" },
      { name: "description", content: "Termos de Uso do NEXO, plataforma da Planeta97 para sellers de marketplace." },
    ],
  }),
  component: TermosDeUso,
});

function TermosDeUso() {
  const e = EMPRESA;
  return (
    <PaginaLegal
      titulo="Termos de Uso"
      resumo={`Em poucas palavras: o ${e.produto} mostra o lucro real dos seus anúncios e traz agentes de IA que sugerem ações. As sugestões são só sugestões: quem decide e aplica é você. A assinatura é paga antes de usar, renova todo mês e pode ser cancelada quando quiser, sem multa, valendo até o fim do período já pago.`}
    >
      <Secao numero={1} titulo="Quem somos e o que são estes Termos">
        <p>
          Estes Termos de Uso regulam o uso do {e.produto}, plataforma online oferecida pela{" "}
          <strong>{e.razaoSocial}</strong> ("{e.nomeFantasia}", "nós"), CNPJ {e.cnpj}, com foro em{" "}
          {e.foro}. Contato: {e.email}.
        </p>
        <p>
          Ao criar uma conta ou usar o {e.produto}, você ("seller", "você") declara que leu, entendeu e
          concorda com estes Termos e com a{" "}
          <Link to="/privacidade" className="text-primary underline underline-offset-2">
            Política de Privacidade
          </Link>
          . Se não concordar, não use a plataforma.
        </p>
        <p>
          O {e.produto} é destinado a pessoas e empresas que vendem em marketplaces, para uso profissional.
          Para criar uma conta, você precisa ter pelo menos 18 anos e poder contratar em nome próprio ou da
          empresa que representa.
        </p>
      </Secao>

      <Secao numero={2} titulo="O que o NEXO faz">
        <Lista
          itens={[
            "Reúne vendas, anúncios, taxas, fretes, custos e anúncios patrocinados (Ads) dos marketplaces conectados (como Mercado Livre, Shopee, TikTok Shop, Magalu, Amazon e Shein).",
            "Calcula lucro, margem e preço de cada anúncio, a partir dos dados dos marketplaces e dos custos que você informa (como o CMV dos produtos).",
            "Oferece agentes de inteligência artificial (Precificação, Gestor, SAC, Estoque, Fulfillment, Ads, Criativo e Auditor) que analisam os dados e sugerem ações.",
            "Envia resumos e avisos pela plataforma e, quando você ativar, pelo WhatsApp.",
            "Quando você autorizar, aplica nos marketplaces as mudanças que você aprovar (como um novo preço ou um novo título de anúncio).",
          ]}
        />
        <p>
          Algumas funções dependem das integrações (APIs) oferecidas por cada marketplace e podem ser
          lançadas aos poucos.
        </p>
      </Secao>

      <Secao numero={3} titulo="Sugestões dos agentes: quem decide é você">
        <p>
          Os agentes de IA <strong>sugerem; nunca executam nada sozinhos</strong>. Nenhum preço, anúncio,
          verba de Ads ou mensagem é alterado no marketplace sem a sua aprovação.
        </p>
        <p>
          As análises e sugestões são feitas a partir dos dados disponíveis e de inteligência artificial, que
          pode errar, ficar desatualizada ou não considerar algo que só você sabe. Por isso, as sugestões não
          são garantia de resultado nem substituem a sua avaliação, a de um contador ou a de outro profissional.
          A decisão de aplicar qualquer mudança, e o resultado dela, são de sua responsabilidade.
        </p>
        <p>
          Os cálculos de lucro e margem dependem dos dados que você informa (custos, impostos, taxas
          adicionais). Se esses dados estiverem errados ou incompletos, os resultados também estarão.
        </p>
      </Secao>

      <Secao numero={4} titulo="Sua conta e a conexão com os marketplaces">
        <Lista
          itens={[
            "Você é responsável por manter seu e-mail e sua senha em segurança e por tudo o que for feito na sua conta. Se perceber acesso indevido, avise a gente na hora.",
            "Ao conectar uma conta de marketplace, você autoriza o NEXO a acessar os dados dessa conta pela integração oficial do marketplace, só para as funções da plataforma. Você pode desconectar a qualquer momento, no NEXO ou no próprio marketplace.",
            "Você declara que tem o direito de conectar as contas de marketplace que adicionar e que segue as regras de cada marketplace.",
            "O NEXO não tem relação com os marketplaces além do uso das integrações oficiais. Mudanças, falhas ou limites nas integrações de terceiros podem afetar funções da plataforma, e não temos controle sobre isso.",
          ]}
        />
      </Secao>

      <Secao numero={5} titulo="Planos, limites de uso e pagamento">
        <Lista
          itens={[
            "Os planos, preços, número de contas conectadas e limites mensais de uso (como interações com os agentes de IA e mensagens de WhatsApp) são os informados na plataforma no momento da contratação.",
            "A assinatura é pré-paga: você paga antes de usar, e ela renova automaticamente todo mês, no mesmo dia em que foi contratada, até ser cancelada.",
            "Quando os créditos mensais do plano acabam, as funções essenciais continuam (como o resumo diário e avisos importantes) e as demais param até o mês seguinte, até um upgrade de plano ou até a compra de créditos avulsos.",
            "Créditos avulsos são pagos na hora da compra e só são liberados depois do pagamento confirmado.",
            "Os preços podem mudar. Qualquer mudança no valor da sua assinatura será avisada com pelo menos 30 dias de antecedência e só vale a partir da renovação seguinte.",
            "Os pagamentos são processados por uma empresa de pagamentos parceira. O NEXO não guarda os dados completos do seu cartão.",
          ]}
        />
      </Secao>

      <Secao numero={6} titulo="Cancelamento">
        <Lista
          itens={[
            "Você pode cancelar a assinatura quando quiser, pela própria plataforma, sem multa.",
            "O cancelamento impede a próxima renovação. Você continua usando o NEXO até o fim do período que já pagou, e não há devolução proporcional desse período.",
            "Após o fim do período pago, a conta deixa de ter acesso às funções do plano. Seus dados são tratados conforme a Política de Privacidade.",
          ]}
        />
      </Secao>

      <Secao numero={7} titulo="Atraso no pagamento">
        <p>
          Se uma fatura não for paga até o vencimento, a plataforma passa a mostrar avisos. Se o atraso
          continuar, as funções de IA e WhatsApp podem ser pausadas e, depois, o acesso à conta pode ser
          bloqueado, nos prazos informados na plataforma. Assim que o pagamento for confirmado, o acesso volta
          ao normal, com os seus dados preservados dentro do prazo previsto na Política de Privacidade.
        </p>
      </Secao>

      <Secao numero={8} titulo="O que não é permitido">
        <Lista
          itens={[
            "Usar o NEXO para qualquer atividade ilegal, para enganar compradores ou para descumprir as regras dos marketplaces.",
            "Tentar acessar contas ou dados de outros usuários, burlar limites de uso ou de segurança, ou atacar a plataforma.",
            "Copiar, revender, alugar ou fazer engenharia reversa do NEXO, ou usá-lo para criar um produto concorrente.",
            "Usar robôs ou programas para acessar a plataforma de forma automatizada, fora das funções oferecidas.",
            "Compartilhar o acesso da sua conta com quem não faz parte da sua empresa.",
          ]}
        />
        <p>
          Se isso acontecer, podemos suspender ou encerrar a conta, avisando você sempre que possível.
        </p>
      </Secao>

      <Secao numero={9} titulo="Propriedade e conteúdo">
        <p>
          O NEXO, sua marca, telas, textos, código e agentes pertencem à {e.razaoSocial}. A assinatura dá a
          você o direito de usar a plataforma enquanto estiver ativa, mas não transfere a propriedade de nada.
        </p>
        <p>
          Os seus dados (vendas, anúncios, custos) e os textos que você cria ou aprova continuam sendo seus. Você
          nos autoriza a usá-los apenas para fazer o NEXO funcionar para você, como explicado na Política de
          Privacidade.
        </p>
      </Secao>

      <Secao numero={10} titulo="Disponibilidade e responsabilidade">
        <p>
          Trabalhamos para que o NEXO funcione sem interrupções, mas ele pode passar por manutenções, falhas
          técnicas ou instabilidades nossas ou de serviços de terceiros (marketplaces, hospedagem, inteligência
          artificial, WhatsApp, pagamentos).
        </p>
        <p>
          Na medida permitida pela lei, a {e.nomeFantasia} não se responsabiliza por lucros que deixaram de ser
          obtidos, perdas de vendas ou decisões de negócio tomadas com base nas informações e sugestões da
          plataforma. Quando houver responsabilidade nossa, ela fica limitada ao valor que você pagou pelo NEXO
          nos 12 meses anteriores ao ocorrido.
        </p>
      </Secao>

      <Secao numero={11} titulo="Mudanças nestes Termos">
        <p>
          Podemos atualizar estes Termos. Quando a mudança for importante, avisaremos pela plataforma ou por
          e-mail com pelo menos 15 dias de antecedência. Se continuar usando o NEXO depois disso, você concorda
          com a nova versão. Se não concordar, pode cancelar a assinatura.
        </p>
      </Secao>

      <Secao numero={12} titulo="Lei e foro">
        <p>
          Estes Termos seguem as leis do Brasil. Fica escolhido o foro da comarca de {e.foro} para resolver
          qualquer questão sobre eles, salvo quando a lei determinar outro.
        </p>
        <p>
          Dúvidas ou reclamações: {e.email}. Respondemos o mais rápido possível.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
