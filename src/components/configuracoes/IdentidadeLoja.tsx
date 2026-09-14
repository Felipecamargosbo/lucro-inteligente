import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Painel } from "@/components/comum/Indicadores";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Identidade da loja: logo, nome da loja e nome do responsável.
 *
 * É o que aparece no rodapé do menu lateral, e são os ÚNICOS campos da aba
 * Empresa que hoje salvam de verdade (vão para a tabela `perfis` no
 * Supabase). Os painéis abaixo — razão social, nome fantasia, CNPJ,
 * endereço, fornecedor — ainda vivem só na memória da tela e somem quando a
 * página é recarregada.
 *
 * Não confundir com o painel "Dados da empresa": lá ficam os nomes FISCAIS
 * (razão social e nome fantasia), usados em documento e nota. Aqui é
 * identidade de tela — por isso os rótulos são "Loja" e "Nome".
 *
 * Nos bastidores, "Loja" grava na coluna `nome_exibicao` e "Nome" na coluna
 * `razao_social` — nomes herdados de quando esses campos tinham outro
 * sentido. Só o rótulo mudou; renomear coluna quebraria o app no intervalo
 * entre o SQL e a publicação, e não vale o risco por cosmética interna.
 */

const TAMANHO_MAXIMO_MB = 2;
const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function IdentidadeLoja() {
  const { perfil, atualizarPerfil, enviarLogo } = useAuth();

  const [nomeLoja, setNomeLoja] = useState(perfil?.nomeExibicao ?? "");
  const [nomeResponsavel, setNomeResponsavel] = useState(perfil?.razaoSocial ?? "");
  const [salvando, setSalvando] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);

  const inputArquivo = useRef<HTMLInputElement>(null);

  const iniciais = (perfil?.nomeExibicao || "Loja")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  async function escolherLogo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    // Limpa o input já: sem isso, escolher o MESMO arquivo de novo (depois de
    // um erro, por exemplo) não dispara evento nenhum e parece travado.
    e.target.value = "";
    if (!arquivo) return;

    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      toast.error("Use uma imagem PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      toast.error(`A imagem precisa ter no máximo ${TAMANHO_MAXIMO_MB} MB.`);
      return;
    }

    setEnviandoLogo(true);
    const { erro } = await enviarLogo(arquivo);
    setEnviandoLogo(false);

    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success("Logo atualizado.");
  }

  async function salvarNomes(e: FormEvent) {
    e.preventDefault();

    const loja = nomeLoja.trim();
    if (!loja) {
      toast.error("O nome da loja não pode ficar em branco.");
      return;
    }

    setSalvando(true);
    const { erro } = await atualizarPerfil({
      nomeExibicao: loja,
      razaoSocial: nomeResponsavel.trim() || null,
    });
    setSalvando(false);

    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success("Identidade da loja atualizada.");
  }

  return (
    <form onSubmit={salvarNomes}>
      <Painel
        titulo="Identidade da loja"
        descricao="Aparece no menu lateral e identifica sua conta"
      >
        <div className="space-y-5 p-5">
          {/* Logo */}
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="size-16 shrink-0 bg-muted text-sm font-bold">
              <AvatarImage
                src={perfil?.logoUrl ?? undefined}
                alt={perfil?.nomeExibicao ?? "Logo da loja"}
              />
              <AvatarFallback className="bg-muted">{iniciais}</AvatarFallback>
            </Avatar>

            <div className="space-y-1.5">
              <input
                ref={inputArquivo}
                type="file"
                accept={TIPOS_ACEITOS.join(",")}
                onChange={escolherLogo}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={enviandoLogo}
                onClick={() => inputArquivo.current?.click()}
                className="text-xs"
              >
                {enviandoLogo ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 size-3.5" />
                )}
                {perfil?.logoUrl ? "Trocar logo" : "Enviar logo"}
              </Button>
              <p className="text-[10px] text-muted-foreground">
                PNG, JPG, WEBP ou SVG, até {TAMANHO_MAXIMO_MB} MB. Imagem quadrada fica
                melhor.
              </p>
            </div>
          </div>

          {/* Nomes. Rótulos de propósito curtos: aqui é identidade de tela,
              não dado fiscal. Razão social e nome fantasia ficam no painel
              "Dados da empresa", logo abaixo. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nome-loja" className="text-xs">
                Loja
              </Label>
              <Input
                id="nome-loja"
                value={nomeLoja}
                onChange={(e) => setNomeLoja(e.target.value)}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Aparece em primeiro lugar no menu lateral.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome-responsavel" className="text-xs">
                Nome
              </Label>
              <Input
                id="nome-responsavel"
                value={nomeResponsavel}
                onChange={(e) => setNomeResponsavel(e.target.value)}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Seu nome. Aparece logo abaixo do nome da loja.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={salvando} className="text-xs">
              {salvando && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </Painel>
    </form>
  );
}
