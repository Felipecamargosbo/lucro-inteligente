import { createFileRoute, Link } from "@tanstack/react-router";
import { EMPRESA } from "@/config/empresa";
import { Lista, PaginaLegal, Secao } from "@/components/legal/PaginaLegal";

export const Route = createFileRoute("/seguranca")({
  head: () => ({
    meta: [
      { title: "Política de Segurança da Informação — Planeta97 NEXO" },
      {
        name: "description",
        content:
          "Como o NEXO, da Planeta97, protege os dados: controle de acesso, criptografia, resposta a incidentes e exclusão de dados.",
      },
    ],
  }),
  component: PoliticaDeSeguranca,
});

function PoliticaDeSeguranca() {
  const e = EMPRESA;
  return (
    <PaginaLegal
      titulo="Política de Segurança da Informação"
      resumo={`Em poucas palavras: só acessa um dado quem precisa dele; as chaves dos marketplaces ficam trancadas no servidor e nunca chegam ao navegador; tudo trafega e fica guardado com criptografia; o suporte só consegue olhar, nunca alterar; e, se algo der errado, avisamos os afetados rapidamente. Dúvidas ou suspeitas de problema: ${e.email}.`}
    >
      <Secao numero={1} titulo="Objetivo e responsável">
        <p>
          Esta Política define como a <strong>{e.razaoSocial}</strong> ("{e.nomeFantasia}"), CNPJ {e.cnpj},
          protege as informações tratadas no {e.produto}: os dados das contas dos clientes, os dados que chegam
          dos marketplaces (Mercado Livre, Shopee, TikTok Shop e outros) e os dados dos compradores. Ela vale para
          todas as pessoas e sistemas da {e.nomeFantasia} e complementa a{" "}
          <Link to="/privacidade" className="underline underline-offset-2">
            Política de Privacidade
          </Link>
          .
        </p>
        <p>
          Responsável pela segurança da informação e pela proteção de dados (encarregado/DPO): {e.encarregado} —{" "}
          {e.email}. Esta Política é revisada pelo menos uma vez por ano e sempre que houver mudança importante no{" "}
          {e.produto}.
        </p>
      </Secao>

      <Secao numero={2} titulo="Classificação dos dados">
        <Lista
          itens={[
            <>
              <strong>Público:</strong> textos do site, Termos de Uso e Políticas.
            </>,
            <>
              <strong>Interno:</strong> configurações do sistema e registros técnicos sem dados pessoais.
            </>,
            <>
              <strong>Confidencial:</strong> dados das contas dos clientes, dados de vendas, anúncios e valores
              vindos dos marketplaces e dados dos compradores. Só o próprio cliente (e as funções do NEXO que
              trabalham para ele) tem acesso.
            </>,
            <>
              <strong>Restrito:</strong> senhas, chaves de acesso (tokens) dos marketplaces e chaves dos
              sistemas. Nunca são mostradas em telas, e-mails ou registros; ficam só no servidor.
            </>,
          ]}
        />
      </Secao>

      <Secao numero={3} titulo="Controle de acesso (privilégio mínimo)">
        <Lista
          itens={[
            "Cada cliente só enxerga os próprios dados: o banco de dados aplica regras de segurança por linha (Row Level Security) em todas as tabelas com dados de clientes.",
            "As chaves de acesso dos marketplaces ficam em colunas que o navegador não tem permissão de ler; só as funções do servidor as usam.",
            "As chaves secretas do sistema existem apenas no servidor e no cofre de segredos; nunca vão para o navegador nem para o código público.",
            "O painel administrativo só é acessível pela conta do administrador e nunca mostra chaves de acesso.",
            "O acesso de suporte à conta de um cliente é somente leitura (o banco bloqueia qualquer alteração), dura no máximo 1 hora e fica registrado.",
            "As contas administrativas (código, banco de dados, hospedagem e e-mail) usam senha forte e verificação em duas etapas.",
            "Quando alguém deixa de precisar de um acesso, ele é removido.",
          ]}
        />
      </Secao>

      <Secao numero={4} titulo="Criptografia">
        <Lista
          itens={[
            "Em trânsito: toda comunicação com o NEXO e com as APIs dos marketplaces usa HTTPS (TLS).",
            "Em repouso: o banco de dados e os backups ficam criptografados pelo provedor de nuvem (AES-256).",
            "Senhas de login são guardadas apenas como hash (não é possível vê-las, nem por nós).",
            "As chamadas às APIs dos marketplaces são assinadas com as chaves do aplicativo, conforme exigido por cada plataforma.",
          ]}
        />
      </Secao>

      <Secao numero={5} titulo="Infraestrutura e rede">
        <Lista
          itens={[
            "O NEXO roda em provedores de nuvem reconhecidos: Cloudflare (site e servidor, com proteção contra ataques DDoS e tráfego malicioso) e Supabase (banco de dados e funções, hospedados nos Estados Unidos).",
            "O banco de dados só é acessado por meio de interfaces autenticadas; não há acesso direto aberto à internet.",
            "As integrações com marketplaces rodam apenas no servidor, separadas da parte do site que o usuário vê.",
          ]}
        />
      </Secao>

      <Secao numero={6} titulo="Segurança no dia a dia">
        <Lista
          itens={[
            "Computadores da empresa com antivírus ativo e sistema atualizado.",
            "Bloqueio de tela com senha quando o computador fica sem uso.",
            "Senhas fortes e únicas, guardadas em local seguro, e verificação em duas etapas nas contas da empresa.",
            "Nenhuma senha, chave ou código de verificação é enviado por mensagem ou e-mail.",
          ]}
        />
      </Secao>

      <Secao numero={7} titulo="Gestão de vulnerabilidades e mudanças">
        <Lista
          itens={[
            "Toda mudança no NEXO é testada primeiro em um ambiente de prévia, separado do ambiente oficial.",
            "Revisamos periodicamente os alertas de segurança do banco de dados e das dependências e corrigimos os pontos encontrados.",
            "As chaves dos aplicativos nos marketplaces são renovadas nos prazos exigidos por cada plataforma e trocadas imediatamente em caso de suspeita de vazamento.",
          ]}
        />
      </Secao>

      <Secao numero={8} titulo="Resposta a incidentes">
        <p>
          Incidente é qualquer suspeita de acesso indevido, vazamento, perda ou alteração de dados. Qualquer pessoa
          pode comunicar uma suspeita pelo e-mail <strong>{e.email}</strong>.
        </p>
        <Lista
          itens={[
            `Responsável: ${e.encarregado}, que coordena a resposta e as comunicações.`,
            "1) Conter: bloquear o acesso indevido, revogar e trocar as chaves envolvidas.",
            "2) Avaliar: entender o que aconteceu, quais dados e quais clientes foram afetados.",
            "3) Comunicar: avisar os clientes afetados e o marketplace envolvido (Mercado Livre, Shopee, TikTok Shop etc.) assim que o incidente for confirmado, e a Autoridade Nacional de Proteção de Dados (ANPD) nos prazos da LGPD.",
            "4) Corrigir e registrar: corrigir a causa, documentar o incidente e as lições aprendidas.",
          ]}
        />
      </Secao>

      <Secao numero={9} titulo="Retenção e exclusão de dados">
        <Lista
          itens={[
            "Guardamos os dados só enquanto forem necessários para o NEXO funcionar para o cliente.",
            "Quando o cliente desconecta um marketplace, o NEXO para de receber os dados dele na hora.",
            "Atendemos pedidos de acesso, correção e exclusão de dados feitos pelo cliente (ou repassados pelo marketplace) pelo e-mail de contato.",
            "Ao fim da relação, os dados são apagados ou anonimizados em até 90 dias, como descrito na Política de Privacidade.",
          ]}
        />
      </Secao>

      <Secao numero={10} titulo="Summary in English">
        <p>
          {e.razaoSocial} (CNPJ {e.cnpj}) operates NEXO, a profit-analytics SaaS for marketplace sellers. We apply
          least-privilege access (row-level security per seller; marketplace tokens readable only by server-side
          functions; read-only, time-limited and logged support access), encryption in transit (TLS) and at rest
          (AES-256, provider-managed), hashed passwords, MFA on administrative accounts, antivirus and screen lock on
          company devices, a preview environment for every change, periodic review of security advisories, and key
          rotation. Incidents are contained, assessed and reported to affected sellers, the marketplace concerned and
          the Brazilian data protection authority (ANPD). Data is deleted or anonymized within 90 days after the end
          of the relationship. Data is hosted in the United States (Supabase, Cloudflare). Security and data
          protection officer: {e.encarregado} — {e.email}.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
