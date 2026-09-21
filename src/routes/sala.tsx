import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useTexture } from "@react-three/drei";
import { Painel } from "@/components/comum/Indicadores";
import multiavatar from "@/lib/multiavatar";

export const Route = createFileRoute("/sala")({
  head: () => ({
    meta: [
      { title: "Sala 3D | Planeta97" },
      {
        name: "description",
        content: "Os agentes de IA do NEXO, em 3D — primeira versão.",
      },
      { property: "og:title", content: "Sala 3D | Planeta97" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sala3D,
});

/**
 * Os agentes que já existem — o nome de cada um vira, sempre, o mesmo
 * personagem (o Multiavatar gera sempre igual a partir do mesmo texto).
 */
const AGENTES_DA_SALA = [
  "Agente de Precificação",
  "Gestor",
  "Agente de SAC",
  "Agente de Estoque",
  "Agente de Fulfillment",
  "Agente de Ads",
  "Agente Criativo",
];

/**
 * Uma mesa (forma simples, por enquanto) com o personagem do agente em
 * pé atrás dela, e o nome flutuando em cima. Quando tivermos os móveis
 * de verdade (Kenney Furniture Kit), só essa parte muda — o personagem
 * continua igual.
 */
function EstacaoAgente({ nome, posicaoX }: { nome: string; posicaoX: number }) {
  // sansEnv=true tira o círculo de fundo colorido do avatar, deixando só
  // o personagem — fica melhor sobreposto na cena 3D.
  const svgDataUri = useMemo(() => {
    const svg = multiavatar(nome, true);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [nome]);

  const textura = useTexture(svgDataUri);

  return (
    <group position={[posicaoX, 0, 0]}>
      {/* Mesa — caixa simples, provisória */}
      <mesh position={[0, 0.4, -0.7]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.8, 0.6]} />
        <meshStandardMaterial color="#8a6d4b" />
      </mesh>
      {/* Cadeira — cilindro simples, provisória */}
      <mesh position={[0, 0.35, 0.2]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.7, 12]} />
        <meshStandardMaterial color="#3a3f4b" />
      </mesh>

      {/* Personagem — avatar real, gerado a partir do nome do agente */}
      <mesh position={[0, 1.15, -0.1]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial map={textura} transparent />
      </mesh>

      {/* Nome flutuando acima */}
      <Text
        position={[0, 1.85, -0.1]}
        fontSize={0.16}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.6}
        textAlign="center"
      >
        {nome}
      </Text>
    </group>
  );
}

function CenaEscritorio() {
  const espacamento = 2.6;
  const inicioX = -((AGENTES_DA_SALA.length - 1) * espacamento) / 2;

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 9, 4]} intensity={1.1} castShadow />

      {/* Chão */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 14]} />
        <meshStandardMaterial color="#242832" />
      </mesh>

      {AGENTES_DA_SALA.map((nome, i) => (
        <EstacaoAgente key={nome} nome={nome} posicaoX={inicioX + i * espacamento} />
      ))}
    </>
  );
}

function Sala3D() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <Painel
        titulo="Sala 3D"
        descricao="Os agentes, em 3D — primeira versão. Móveis em formas simples por enquanto; os personagens já são reais."
      >
        <div className="h-[600px] w-full overflow-hidden rounded-b-lg bg-[#14161b]">
          <Canvas shadows camera={{ position: [0, 4.5, 11], fov: 50 }}>
            <Suspense fallback={null}>
              <CenaEscritorio />
            </Suspense>
            <OrbitControls
              enablePan
              minDistance={4}
              maxDistance={20}
              maxPolarAngle={Math.PI / 2.05}
            />
          </Canvas>
        </div>
        <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
          Arraste pra girar, role o mouse pra aproximar. Os personagens são gerados de
          verdade a partir do nome de cada agente — sempre o mesmo personagem pro mesmo
          agente. Os móveis ainda são formas simples; entram os de verdade numa próxima etapa.
        </div>
      </Painel>
    </div>
  );
}
