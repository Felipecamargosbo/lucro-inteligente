# Lucro Inteligente

Quero construir um SaaS brasileiro de gestão e inteligência de rentabilidade para vendedores que trabalham com múltiplos marketplaces.

O objetivo principal do sistema é resolver um problema comum dos sellers: eles sabem quanto venderam, mas muitas vezes não sabem quanto realmente ganharam depois de CMV, comissão do marketplace, taxas, impostos, descontos, frete, promoções e outros custos.

O sistema deverá mostrar de forma clara quanto cada venda realmente gerou de faturamento, custo, lucro líquido e margem.

IMPORTANTE:

Eu sou iniciante em programação. Não quero apenas receber códigos ou explicações técnicas. Quero que você construa a aplicação e me explique de forma simples o que está sendo feito.

Neste primeiro momento NÃO quero implementar APIs reais, pagamentos, autenticação avançada ou integrações reais com marketplaces. Primeiro quero construir o layout, a estrutura de navegação e um protótipo funcional usando dados fictícios realistas.

A aplicação deverá ser preparada desde o início para posteriormente receber APIs reais.

==================================================

IDENTIDADE DO PRODUTO

==================================================

É um SaaS B2B para sellers e empresas de e-commerce.

O visual deve transmitir:

- tecnologia

- confiança

- inteligência de dados

- profissionalismo

- simplicidade

- sensação de produto premium

Não quero uma interface poluída.

Quero um dashboard moderno, elegante e muito fácil de entender.

Utilize uma identidade visual própria. Não copie nenhum site existente.

A interface deve estar em PORTUGUÊS DO BRASIL.

Use valores em BRL (R$), datas no formato brasileiro e termos utilizados por sellers brasileiros.

==================================================

ESTRUTURA PRINCIPAL

==================================================

Criar uma aplicação web com menu lateral.

Menu:

1. Dashboard

2. Vendas

3. Anúncios

4. Calculadora

5. Promoções

6. Recuperação de vendas

7. Estoque

8. Fulfillment

9. Marketplaces

10. Configurações

Na parte inferior do menu mostrar:

- nome do usuário

- empresa

- plano contratado

- opção de sair

O menu deve poder ser recolhido para aumentar a área útil.

==================================================

DASHBOARD

==================================================

Criar um Dashboard executivo.

No topo deve existir um seletor de período com:

- Hoje

- Ontem

- Últimos 7 dias

- Últimos 30 dias

- Este mês

- Mês passado

- Período personalizado

No período personalizado permitir selecionar:

Data inicial

Data final

Todos os gráficos e indicadores deverão respeitar o período selecionado.

Criar cards principais:

- Faturamento

- Quantidade de pedidos

- Ticket médio

- CMV

- Impostos

- Comissões

- Custos

- Lucro líquido

- Margem líquida

- Pedidos cancelados

- Valor de vendas canceladas

Criar gráfico de PROJEÇÃO.

A projeção deve estimar o resultado final do mês com base nas vendas realizadas até o momento.

Exemplo:

Se nos primeiros dias as vendas estiverem maiores, a projeção sobe.

Se as vendas diminuírem, a projeção também deve diminuir.

Mostrar:

- faturamento realizado

- projeção de faturamento no final do mês

Também criar a seção "Evolução", que será um comparativo com período anterior.

Exemplo:

- faturamento atual x período anterior

- lucro atual x período anterior

- margem atual x período anterior

Criar gráficos visualmente profissionais.

==================================================

VENDAS

==================================================

Criar uma página de vendas detalhada.

Ela deverá permitir consultar venda por venda.

No topo:

- filtro por período

- marketplace

- status

- SKU

- produto

- pedido

- cliente

Criar tabela de pedidos.

Colunas sugeridas:

- Data

- Pedido

- Marketplace

- SKU

- Produto

- Quantidade

- Preço de venda

- Faturamento

- CMV

- Comissão

- Taxa fixa

- Impostos

- Descontos

- Outros custos

- Lucro líquido

- Margem

Ao clicar em uma venda, abrir um painel/modal com o detalhamento completo daquela venda.

O seller precisa conseguir entender exatamente como o valor da venda foi transformado no lucro final.

Exemplo:

Preço de venda: R$ 100,00

- CMV: R$ 40,00

- Comissão: R$ 16,00

- Taxa fixa: R$ 5,00

- Impostos: R$ 10,00

- Outros custos: R$ 2,00

Lucro líquido: R$ 27,00

Margem líquida: 27%

O cálculo mostrado é apenas demonstrativo neste protótipo.

==================================================

ANÚNCIOS

==================================================

Criar uma página de anúncios.

O objetivo dessa página é diferente da página Vendas.

Vendas mostra o resultado das vendas realizadas.

Anúncios serve para administrar os anúncios e analisar o preço atual.

Tabela:

- Marketplace

- SKU

- Produto

- Preço atual

- CMV

- Imposto

- Comissão

- Taxas

- Lucro estimado

- Margem

- Status

Mostrar ao lado da margem um indicador:

"DISPONÍVEL"

quando o anúncio estiver participando de uma promoção.

Também criar ação para alterar o preço do anúncio.

IMPORTANTE:

Toda alteração de preço deverá futuramente possuir:

- preço anterior

- preço novo

- data

- hora

- usuário que realizou a alteração

Criar uma seção "Últimos preços" ou "Histórico de preços" mostrando as alterações realizadas.

Neste protótipo usar dados fictícios.

Não implementar API ainda.

==================================================

CALCULADORA

==================================================

Criar uma calculadora independente.

Essa será a única área que não depende de período/data.

O usuário deverá conseguir calcular o preço ideal de venda de um produto.

Campos:

- Marketplace

- Produto

- Custo/CMV

- Imposto

- Comissão

- Taxa fixa

- Outros custos

- Margem desejada

A margem desejada poderá ser informada de três maneiras:

1. Porcentagem

2. Valor em reais

3. Preço de venda

O usuário poderá escolher como quer trabalhar.

A calculadora deverá mostrar:

- Preço de venda

- CMV

- Impostos

- Comissão

- Taxas

- Outros custos

- Lucro líquido

- Margem final

A ideia futura é permitir selecionar um marketplace e o sistema automaticamente aplicar as regras daquele marketplace.

Neste primeiro protótipo utilizar regras fictícias configuráveis.

==================================================

PROMOÇÕES

==================================================

Criar uma página de Promoções.

Essa funcionalidade será principalmente voltada para recursos específicos dos marketplaces.

O primeiro marketplace que terá uma área de promoção específica será o Mercado Livre.

Criar uma área de exemplo:

Mercado Livre

Promoções disponíveis

Mostrar:

- Produto

- SKU

- Preço atual

- Tipo de promoção

- Rebate

- Preço final

- Lucro líquido

- Margem final

Exemplo:

Preço atual: R$ 50,00

Rebate: R$ 5,00

Preço promocional: R$ 45,00

Mostrar claramente:

"APROVEITAR"

ou

"NÃO PARTICIPAR"

IMPORTANTE:

O sistema NUNCA deverá participar automaticamente de uma promoção.

A decisão sempre será do seller.

Neste protótipo os dados são fictícios.

==================================================

RECUPERAÇÃO DE VENDAS

==================================================

Criar uma página chamada:

"Recuperação de vendas"

Objetivo:

mostrar vendas/pedidos cancelados para que o seller identifique oportunidades de tentar recuperar aquela venda por conta própria.

Mostrar no topo:

- Valor total das vendas canceladas

- Quantidade de pedidos cancelados

Criar tabela:

- Data

- Pedido

- Cliente

- Telefone

- Produto

- Quantidade

- Valor da venda

- Status

O telefone do cliente deverá aparecer diretamente na tabela.

Criar botão para copiar o telefone.

Não criar integração com WhatsApp neste momento.

O seller utilizará o telefone para entrar no WhatsApp manualmente.

==================================================

ESTOQUE

==================================================

Criar uma página de estoque.

Futuramente o estoque será puxado automaticamente através das APIs dos marketplaces.

Não quero que o seller precise ficar digitando estoque manualmente.

No protótipo utilizar dados fictícios.

Mostrar:

- SKU

- Produto

- Marketplace

- Estoque atual

- Média de vendas por dia

- Cobertura de estoque em dias

- Status

Exemplo:

Estoque atual: 100 unidades

Média diária: 10 unidades

Cobertura: 10 dias

Criar filtro por:

- marketplace

- produto

- SKU

- período

Criar gráfico de vendas por dia.

O usuário deverá escolher uma data inicial e uma data final.

O gráfico deverá mostrar somente o período selecionado.

==================================================

FULFILLMENT

==================================================

Criar uma página de Fulfillment.

Ela deverá compartilhar a mesma inteligência de estoque.

Mostrar:

- Produto

- SKU

- Estoque atual no fulfillment

- Média de vendas diária

- Cobertura de estoque

- Status

Criar gráfico de vendas por dia.

Permitir selecionar:

Data inicial

Data final

Mostrar a evolução das vendas no período escolhido.

Também mostrar uma visão geral para o seller entender se o estoque disponível no fulfillment está adequado em relação às vendas.

Não implementar custos de fulfillment neste primeiro protótipo.

==================================================

MARKETPLACES

==================================================

Criar uma área chamada:

"Marketplaces"

Ela deverá funcionar como uma área central para os canais conectados.

Criar uma página principal mostrando cards:

- Mercado Livre

- Shopee

- Amazon

- Magalu

- TikTok Shop

- Shein

Cada marketplace deverá mostrar futuramente:

- conectado

- não conectado

- última sincronização

Criar estrutura para futuramente existir uma subárea específica de cada marketplace.

IMPORTANTE:

Neste primeiro protótipo NÃO conectar nenhuma API real.

==================================================

CONFIGURAÇÕES

==================================================

Criar uma página de Configurações com menu interno.

Seções:

- Dados da empresa

- Usuários e permissões

- Marketplaces / APIs

- Regras financeiras

- Impostos

- Comissões

- Taxas

- Margem desejada

- Histórico / Log de alterações

- Preferências

Criar uma área de:

"APIs"

Mostrar os marketplaces:

Mercado Livre

Shopee

Amazon

Magalu

TikTok Shop

Shein

Status:

CONECTADO

ou

NÃO CONECTADO

Mostrar também:

Última sincronização.

Não implementar conexões reais agora.

==================================================

USUÁRIOS E PERMISSÕES

==================================================

Preparar a estrutura para diferentes usuários.

Exemplos:

Administrador

Analista

Operacional

O administrador poderá futuramente controlar permissões.

Criar a interface de gerenciamento de usuários.

==================================================

LOG DE ALTERAÇÕES

==================================================

Criar estrutura visual para registrar alterações importantes.

Mostrar:

- Data

- Hora

- Usuário

- Ação

- Valor anterior

- Novo valor

Exemplo:

21/08/2026

13:42

Felipe

Alteração de preço

R$ 59,90 → R$ 64,90

Isso será importante principalmente para alterações de preços e configurações financeiras.

==================================================

NOTIFICAÇÕES

==================================================

Criar um sistema visual de notificações.

Não quero que o Dashboard seja transformado em uma central de alertas.

As notificações deverão ficar em uma área própria, acessível pelo ícone de notificações.

Criar exemplos fictícios como:

- Sincronização concluída

- Marketplace desconectado

- Erro de sincronização

- Alteração de configuração

- Nova promoção disponível

IMPORTANTE:

Promoções não devem aparecer como alerta obrigatório no Dashboard.

O seller deve entrar na área de Promoções para verificar oportunidades.

==================================================

EXPORTAÇÃO

==================================================

Preparar a interface para exportação de dados em:

- CSV

- Excel

A exportação deverá existir nas áreas de dados do sistema.

Não colocar exportação na Calculadora.

==================================================

PERÍODOS E GRÁFICOS

==================================================

Essa regra é muito importante:

Todas as áreas que trabalham com vendas, estoque, faturamento, anúncios ou desempenho deverão estar preparadas para trabalhar com períodos.

O usuário deverá poder selecionar:

- Hoje

- Ontem

- Últimos 7 dias

- Últimos 30 dias

- Este mês

- Mês passado

- Período personalizado

Período personalizado:

Data inicial → Data final

Os gráficos deverão atualizar conforme o período escolhido.

A Calculadora não precisa de filtro de data.

==================================================

ARQUITETURA

==================================================

Quero que o projeto seja criado de forma organizada e escalável.

Separar claramente:

- componentes

- páginas

- lógica de negócio

- dados

- serviços

- tipos

- configurações

Não criar código desnecessariamente duplicado.

Preparar o projeto para futuramente receber:

- APIs dos marketplaces

- banco de dados real

- autenticação

- sistema de assinatura

- pagamentos

- sincronização automática

- múltiplos usuários

- permissões

- histórico

- regras específicas por marketplace

==================================================

IMPORTANTE SOBRE DADOS

==================================================

Neste primeiro estágio utilizar dados fictícios realistas apenas para demonstrar a interface.

NÃO fingir que existe conexão real com Mercado Livre, Shopee, Amazon, Magalu, TikTok Shop ou Shein.

Deixar claramente a estrutura preparada para integração futura.

==================================================

EXPERIÊNCIA DO USUÁRIO

==================================================

O sistema precisa ser extremamente intuitivo para uma pessoa que não entende de contabilidade.

Evitar excesso de informações.

Usar cards, gráficos, tabelas e indicadores de forma organizada.

Quando houver muita informação, utilizar:

- abas

- filtros

- dropdowns

- modais

- tooltips

- páginas de detalhes

Priorizar clareza.

O seller deve conseguir responder rapidamente:

"Quanto vendi?"

"Quanto vou ganhar?"

"Quanto realmente sobrou?"

"Qual é minha margem?"

"Qual produto está dando mais resultado?"

"Quanto estoque eu tenho?"

"Quantos dias de estoque ainda tenho?"

"Quais anúncios estão disponíveis para promoção?"

"Quanto estou perdendo com pedidos cancelados?"

==================================================

PRIMEIRA ENTREGA

==================================================

Nesta primeira etapa quero que você construa:

1. Layout completo da aplicação

2. Menu lateral

3. Dashboard

4. Página Vendas

5. Página Anúncios

6. Calculadora

7. Promoções

8. Recuperação de vendas

9. Estoque

10. Fulfillment

11. Marketplaces

12. Configurações

13. Sistema visual de notificações

14. Histórico de alterações

15. Usuários e permissões

Utilize dados fictícios para que todas essas telas possam ser visualizadas e navegadas.

Crie uma experiência visual profissional, moderna e premium.

NÃO implemente APIs reais nesta primeira etapa.

NÃO implemente pagamento nesta primeira etapa.

NÃO implemente a Landing Page nesta primeira etapa.

NÃO implemente o Checkout nesta primeira etapa.

O objetivo agora é construir o núcleo visual e estrutural do SaaS.

Depois que essa primeira versão estiver funcionando, quero que você me explique o que foi criado e quais serão os próximos passos antes de implementar qualquer API real.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3c21440f-1b05-422c-9067-91c1af810981).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
