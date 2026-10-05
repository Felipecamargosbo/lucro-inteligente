import { createFileRoute, Link } from "@tanstack/react-router";
import { EMPRESA } from "@/config/empresa";
import { Lista, PaginaLegal, Secao } from "@/components/legal/PaginaLegal";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Planeta97 NEXO" },
      {
        name: "description",
        content: "Como o NEXO, da Planeta97, coleta, usa e protege os dados pessoais, conforme a LGPD.",
      },
    ],
  }),
  component: PoliticaDePrivacidade,
});

function PoliticaDePrivacidade() {
  const e = EMPRESA;
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      resumo={`Em poucas palavras: usamos os seus dados só para fazer o ${e.produto} funcionar para você. Não vendemos dados para ninguém. Os dados dos seus compradores, que chegam pelos marketplaces, continuam sendo seus: nós só os tratamos em seu nome. Você pode pedir para ver, corrigir ou apagar os seus dados a qualquer momento pelo e-mail ${e.email}.`}
    >
      <Secao numero={1} titulo="Quem cuida dos seus dados">
        <p>
          Esta Política explica como a <strong>{e.razaoSocial}</strong> ("{e.nomeFantasia}"), CNPJ {e.cnpj},
          trata dados pessoais no {e.produto}, seguindo a Lei Geral de Proteção de Dados (Lei 13.709/2018,
          "LGPD").
        </p>
        <Lista
          itens={[
            <>
              <strong>Dados da sua conta</strong> (seus dados como cliente do NEXO): a {e.nomeFantasia} é a{" "}
              <em>controladora</em>, ou seja, decide como e por que esses dados são usados.
            </>,
            <>
              <strong>Dados dos seus compradores</strong> (que chegam pelos pedidos e perguntas dos
              marketplaces): <em>você</em> é o controlador, e a {e.nomeFantasia} atua como <em>operadora</em>,
              tratando esses dados só em seu nome e para as funções do NEXO.
            </>,
          ]}
        />
        <p>
          Encarregado pelo tratamento de dados (DPO): {e.encarregado} — {e.email}.
        </p>
      </Secao>

      <Secao numero={2} titulo="Quais dados coletamos">
        <p>
          <strong>Que você nos informa:</strong>
        </p>
        <Lista
          itens={[
            "Cadastro: nome, e-mail e senha (a senha é guardada de forma criptografada; nem nós conseguimos vê-la).",
            "Dados da empresa: razão social, CNPJ, regime tributário, logo e configurações.",
            "Dados do negócio: custos dos produtos (CMV), categorias, metas, ajustes de preço, informações extras dos anúncios e outras informações que você cadastrar.",
            "Número de WhatsApp, se você ativar os avisos por lá.",
            "Mensagens que você envia aos agentes de IA ou ao nosso suporte.",
          ]}
        />
        <p>
          <strong>Que vêm dos marketplaces que você conectar</strong> (pelas integrações oficiais, só com a sua
          autorização):
        </p>
        <Lista
          itens={[
            "Dados da conta de vendedor, anúncios, preços, estoque, vendas, pedidos, taxas, comissões, fretes, devoluções e anúncios patrocinados (Ads).",
            "Dados dos compradores que aparecem nos pedidos e nas perguntas (como nome, cidade e o texto das perguntas), quando o marketplace os fornecer.",
          ]}
        />
        <p>
          <strong>Que são gerados pelo uso:</strong>
        </p>
        <Lista
          itens={[
            "Registros de acesso (data, hora e endereço IP), que a lei brasileira (Marco Civil da Internet) obriga a guardar por 6 meses.",
            "Quantidade de uso dos agentes de IA e das mensagens de WhatsApp, para controlar os limites do seu plano.",
            "Preferências, como o tema claro ou escuro.",
          ]}
        />
        <p>
          <strong>De pagamento:</strong> o pagamento é feito por uma empresa de pagamentos parceira. Recebemos só
          a confirmação, o valor e a situação da cobrança. Os dados completos do cartão ficam com ela, não com a
          gente.
        </p>
      </Secao>

      <Secao numero={3} titulo="Para que usamos os dados">
        <Lista
          itens={[
            "Criar e manter sua conta e fazer o login funcionar (base legal: execução do contrato).",
            "Calcular lucro, margem e preços, mostrar os painéis e gerar as sugestões dos agentes (execução do contrato).",
            "Responder perguntas de compradores com sugestões do agente de SAC, quando você usar essa função (execução do contrato, em seu nome).",
            "Enviar resumos e avisos pela plataforma, por e-mail e, se você ativar, pelo WhatsApp (execução do contrato).",
            "Cobrar a assinatura e emitir notas fiscais (execução do contrato e obrigação legal).",
            "Manter a segurança, evitar fraudes e cumprir a lei, como guardar os registros de acesso (obrigação legal e legítimo interesse).",
            "Melhorar o NEXO, usando dados de uso de forma agregada, sem identificar você (legítimo interesse).",
          ]}
        />
        <p>
          <strong>Não vendemos nem alugamos seus dados.</strong> Também não usamos os dados dos seus compradores
          para nenhuma finalidade nossa, como publicidade.
        </p>
      </Secao>

      <Secao numero={4} titulo="Inteligência artificial">
        <p>
          Para gerar análises e sugestões, os agentes enviam a um provedor de inteligência artificial (hoje, a
          OpenAI) apenas os dados necessários para aquela tarefa, como dados de um anúncio ou o texto de uma
          pergunta de comprador. Pelas regras do serviço contratado, o provedor não usa esses dados para
          treinar os modelos dele.
        </p>
      </Secao>

      <Secao numero={5} titulo="Com quem compartilhamos">
        <p>Só com empresas que nos ajudam a fazer o NEXO funcionar, e só o necessário:</p>
        <Lista
          itens={[
            "Hospedagem e banco de dados (Supabase e Cloudflare).",
            "Inteligência artificial (OpenAI).",
            "Envio de mensagens de WhatsApp (Meta / WhatsApp Business).",
            "Empresa de pagamentos e contabilidade, para cobrança e obrigações fiscais.",
            "Os próprios marketplaces, quando você aprovar uma ação que precisa ser enviada a eles (como mudar um preço).",
            "Autoridades públicas, quando a lei ou uma ordem judicial exigir.",
          ]}
        />
      </Secao>

      <Secao numero={6} titulo="Dados fora do Brasil">
        <p>
          Alguns desses parceiros guardam ou processam dados em servidores fora do Brasil (por exemplo, nos
          Estados Unidos). Nesses casos, escolhemos empresas com padrões de segurança reconhecidos e seguimos as
          regras da LGPD para transferência internacional de dados.
        </p>
      </Secao>

      <Secao numero={7} titulo="Por quanto tempo guardamos">
        <Lista
          itens={[
            "Enquanto sua conta estiver ativa.",
            "Depois do cancelamento, guardamos os dados por até 90 dias, para o caso de você voltar. Depois disso, apagamos ou tornamos anônimos.",
            "Alguns dados ficam mais tempo quando a lei obriga: registros de acesso por 6 meses e dados de cobrança e notas fiscais pelo prazo exigido pela lei fiscal (em geral, 5 anos).",
            "Ao desconectar um marketplace, paramos de receber os dados dele na hora.",
          ]}
        />
      </Secao>

      <Secao numero={8} titulo="Como protegemos">
        <Lista
          itens={[
            "Conexão sempre criptografada (o cadeado no navegador).",
            "Cada conta só enxerga os próprios dados: o banco de dados bloqueia o acesso aos dados de outras contas.",
            "Senhas guardadas de forma criptografada.",
            "As autorizações dos marketplaces ficam guardadas com segurança e só são usadas pelas funções do NEXO.",
            "Acesso interno restrito ao mínimo necessário.",
          ]}
        />
        <p>
          Nenhum sistema é 100% invulnerável. Se acontecer um incidente de segurança que possa trazer risco a
          você, avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD), como manda a lei.
        </p>
      </Secao>

      <Secao numero={9} titulo="Seus direitos">
        <p>Pela LGPD, você pode, a qualquer momento:</p>
        <Lista
          itens={[
            "Confirmar se tratamos seus dados e ter acesso a eles.",
            "Corrigir dados incompletos, errados ou desatualizados.",
            "Pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei.",
            "Pedir uma cópia dos seus dados para levar a outro serviço (portabilidade).",
            "Saber com quem compartilhamos seus dados.",
            "Retirar um consentimento que tenha dado (como os avisos por WhatsApp).",
            "Pedir a exclusão da conta e dos dados.",
          ]}
        />
        <p>
          Para isso, escreva para <strong>{e.email}</strong>. Respondemos em até 15 dias. Você também pode
          reclamar à ANPD (gov.br/anpd).
        </p>
        <p>
          Se um <strong>comprador</strong> seu pedir algo sobre os dados dele, o pedido deve ser feito a você, que
          é o controlador. Nós ajudamos no que for preciso.
        </p>
      </Secao>

      <Secao numero={10} titulo="Cookies e armazenamento no navegador">
        <p>
          O NEXO usa apenas o armazenamento necessário para funcionar: manter você conectado e lembrar
          preferências, como o tema claro ou escuro. Não usamos cookies de publicidade nem de rastreamento de
          terceiros.
        </p>
      </Secao>

      <Secao numero={11} titulo="Mudanças nesta Política">
        <p>
          Podemos atualizar esta Política. Quando a mudança for importante, avisaremos pela plataforma ou por
          e-mail. A data da última atualização fica no topo da página. Veja também os{" "}
          <Link to="/termos" className="text-primary underline underline-offset-2">
            Termos de Uso
          </Link>
          .
        </p>
      </Secao>
    </PaginaLegal>
  );
}
