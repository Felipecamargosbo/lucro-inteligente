import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Painel } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { modelosSacService, regrasSacService, sacConfigService } from "@/services";
import {
  CAMPOS_MODELO_SAC,
  CONFIGURACAO_SAC_PADRAO,
  MODELOS_SAC_PADRAO,
  ROTULO_SITUACAO_SAC,
} from "@/lib/sac";
import type { ConfiguracaoSac, RegraSac, SituacaoSac, TomSac } from "@/types";

/**
 * Aba "Atendimento (SAC)": tudo que deixa a resposta do Agente de SAC com
 * a cara da loja — tom de voz, assinatura, política de troca/garantia/
 * envio, frases proibidas, as mensagens prontas de pós-venda e as regras
 * que o SAC aprendeu com as suas edições.
 */
export function AbaAtendimento() {
  const { sessao } = useAuth();
  const perfilId = sessao?.user.id ?? null;
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfiguracaoSac>(CONFIGURACAO_SAC_PADRAO);
  const [modelos, setModelos] = useState<Record<SituacaoSac, string>>(MODELOS_SAC_PADRAO);
  const [regras, setRegras] = useState<RegraSac[]>([]);
  const [novaRegra, setNovaRegra] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    if (!perfilId) return;
    (async () => {
      const [c, m, r] = await Promise.all([
        sacConfigService.carregar(perfilId),
        modelosSacService.listar(perfilId),
        regrasSacService.listar(perfilId),
      ]);
      setConfig(c);
      setModelos(m);
      setRegras(r);
      setCarregando(false);
    })();
  }, [perfilId]);

  if (!perfilId) return null;
  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Carregando o atendimento...
      </div>
    );
  }

  const mudar = <K extends keyof ConfiguracaoSac>(campo: K, valor: ConfiguracaoSac[K]) =>
    setConfig((atual) => ({ ...atual, [campo]: valor }));

  const salvarConfig = async () => {
    setSalvando("config");
    const erro = await sacConfigService.salvar(perfilId, config);
    setSalvando(null);
    if (erro) toast.error(`Não consegui salvar: ${erro}`);
    else toast.success("Personalização do SAC salva.");
  };

  const salvarModelo = async (situacao: SituacaoSac) => {
    setSalvando(situacao);
    const erro = await modelosSacService.salvar(perfilId, situacao, modelos[situacao]);
    setSalvando(null);
    if (erro) toast.error(`Não consegui salvar: ${erro}`);
    else toast.success("Mensagem pronta salva.");
  };

  const recarregarRegras = async () => setRegras(await regrasSacService.listar(perfilId));

  const adicionarRegra = async () => {
    if (!novaRegra.trim()) return;
    const erro = await regrasSacService.criar(perfilId, novaRegra.trim(), "manual");
    if (erro) {
      toast.error(`Não consegui salvar a regra: ${erro}`);
      return;
    }
    setNovaRegra("");
    await recarregarRegras();
  };

  const alternarRegra = async (r: RegraSac) => {
    setRegras((atual) => atual.map((x) => (x.id === r.id ? { ...x, ativa: !r.ativa } : x)));
    const erro = await regrasSacService.alternar(r.id, !r.ativa);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await recarregarRegras();
    }
  };

  const apagarRegra = async (r: RegraSac) => {
    setRegras((atual) => atual.filter((x) => x.id !== r.id));
    const erro = await regrasSacService.apagar(r.id);
    if (erro) {
      toast.error(`Não consegui apagar: ${erro}`);
      await recarregarRegras();
    }
  };

  return (
    <div className="space-y-6">
      <Painel
        titulo="Como o SAC fala"
        descricao="Vale pra toda resposta que a IA sugerir. Deixe em branco o que não quiser informar"
      >
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Tom de voz</Label>
            <Select value={config.tom} onValueChange={(v) => mudar("tom", v as TomSac)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="neutro">Neutro (cordial e direto)</SelectItem>
                <SelectItem value="descontraido">Descontraído</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assinatura</Label>
            <Input
              value={config.assinatura}
              onChange={(e) => mudar("assinatura", e.target.value)}
              placeholder="Ex.: Equipe Planeta97"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Política de troca e devolução</Label>
            <Textarea
              value={config.politicaTroca}
              onChange={(e) => mudar("politicaTroca", e.target.value)}
              placeholder="Ex.: Troca em até 7 dias após o recebimento, com o produto na embalagem original."
              className="min-h-16 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Garantia</Label>
            <Input
              value={config.garantia}
              onChange={(e) => mudar("garantia", e.target.value)}
              placeholder="Ex.: 90 dias direto com a loja"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prazo de envio</Label>
            <Input
              value={config.prazoEnvio}
              onChange={(e) => mudar("prazoEnvio", e.target.value)}
              placeholder="Ex.: Postamos em até 1 dia útil"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Frases que o SAC nunca deve usar (uma por linha)</Label>
            <Textarea
              value={config.frasesProibidas}
              onChange={(e) => mudar("frasesProibidas", e.target.value)}
              placeholder={"Ex.:\nWhatsApp\nfrete grátis garantido\no melhor do mercado"}
              className="min-h-20 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              A IA não usa essas frases, e a tela avisa se alguma aparecer numa resposta. Telefone,
              e-mail e contato fora do marketplace já são sempre proibidos.
            </p>
          </div>
        </div>
        <div className="border-t px-4 py-3">
          <Button size="sm" onClick={salvarConfig} disabled={salvando === "config"} className="text-xs">
            {salvando === "config" && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      </Painel>

      <Painel
        titulo="Mensagens prontas de pós-venda"
        descricao="Usadas quando o cliente pergunta do pedido — sem IA, não gastam token"
      >
        <div className="space-y-4 p-4">
          <p className="text-[11px] text-muted-foreground">
            Campos que se preenchem sozinhos: {CAMPOS_MODELO_SAC.join(", ")}.
          </p>
          {(Object.keys(ROTULO_SITUACAO_SAC) as SituacaoSac[]).map((situacao) => (
            <div key={situacao} className="space-y-1.5">
              <Label className="text-xs">{ROTULO_SITUACAO_SAC[situacao]}</Label>
              <Textarea
                value={modelos[situacao]}
                onChange={(e) => setModelos((atual) => ({ ...atual, [situacao]: e.target.value }))}
                className="min-h-24 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => salvarModelo(situacao)}
                  disabled={salvando === situacao}
                  className="text-xs"
                >
                  {salvando === situacao && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  Salvar esta mensagem
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setModelos((atual) => ({ ...atual, [situacao]: MODELOS_SAC_PADRAO[situacao] }))
                  }
                  className="text-xs"
                >
                  Voltar ao texto padrão
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Painel>

      <Painel
        titulo="Regras do SAC"
        descricao="O que o SAC aprendeu com as suas edições, mais as regras que você escreveu"
      >
        <div className="divide-y">
          {regras.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhuma regra ainda. Quando você editar uma resposta do SAC e pedir pra ele aprender,
              a regra aparece aqui.
            </p>
          )}
          {regras.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3">
              {r.origem === "aprendida" ? (
                <Brain className="mt-0.5 size-4 shrink-0 text-brand" />
              ) : (
                <span className="mt-0.5 size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-xs ${r.ativa ? "" : "text-muted-foreground line-through"}`}>
                  {r.regra}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {r.origem === "aprendida" ? "Aprendida com uma edição sua" : "Escrita por você"} ·{" "}
                  {new Date(r.criadaEm).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Switch checked={r.ativa} onCheckedChange={() => alternarRegra(r)} />
              <Button size="icon" variant="ghost" className="size-8" onClick={() => apagarRegra(r)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t px-4 py-3">
          <Input
            value={novaRegra}
            onChange={(e) => setNovaRegra(e.target.value)}
            placeholder="Ex.: Sempre agradecer a compra no começo da resposta."
            className="h-9 text-xs"
            onKeyDown={(e) => e.key === "Enter" && adicionarRegra()}
          />
          <Button size="sm" onClick={adicionarRegra} disabled={!novaRegra.trim()} className="text-xs">
            <Plus className="size-3.5" />
            Adicionar
          </Button>
        </div>
      </Painel>
    </div>
  );
}
