import { useState, type ReactNode } from "react";
import { MenuLateral } from "./MenuLateral";
import { BarraSuperior } from "./BarraSuperior";
import { PainelNotificacoes } from "./PainelNotificacoes";
import { AvisoContaSemDados } from "./AvisoContaSemDados";
import { FaixaSuporte } from "./FaixaSuporte";
import { AvisoAssinatura } from "./AvisoAssinatura";

export function AppShell({ children }: { children: ReactNode }) {
  const [recolhido, setRecolhido] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <MenuLateral recolhido={recolhido} alternar={() => setRecolhido((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <FaixaSuporte />
        <AvisoAssinatura />
        <BarraSuperior aoAbrirNotificacoes={() => setNotificacoesAbertas(true)} />
        <main className="flex-1 p-6">
          <AvisoContaSemDados />
          {children}
        </main>
      </div>
      <PainelNotificacoes aberto={notificacoesAbertas} aoFechar={setNotificacoesAbertas} />
    </div>
  );
}
