import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, useAnimations, useFBX, useGLTF, useTexture } from "@react-three/drei";
import { SkeletonUtils } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { Painel } from "@/components/comum/Indicadores";

export const Route = createFileRoute("/sala")({
  head: () => ({
    meta: [
      { title: "Sala 3D | Planeta97" },
      {
        name: "description",
        content: "Os agentes de IA do NEXO, em 3D — com personagens e móveis reais (Kenney).",
      },
      { property: "og:title", content: "Sala 3D | Planeta97" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sala3D,
});

const AGENTES_DA_SALA = [
  "Agente de Precificação",
  "Gestor",
  "Agente de SAC",
  "Agente de Estoque",
  "Agente de Fulfillment",
  "Agente de Ads",
  "Agente Criativo",
];

/** As 4 peles que vieram no pacote — com 7 agentes, algumas se repetem
 * por enquanto. Manda mais peles depois que a gente resolve isso. */
const PELES = [
  "/kenney/personagem/skins/criminalMaleA.png",
  "/kenney/personagem/skins/cyborgFemaleA.png",
  "/kenney/personagem/skins/skaterFemaleA.png",
  "/kenney/personagem/skins/skaterMaleA.png",
];

/**
 * O personagem, parado, animado (idle). O escalonamento (0.011) e a
 * rotação são meu melhor palpite pro tamanho/direção do modelo — como eu
 * não consigo ver o resultado renderizado, é bem provável que precise de
 * um ajuste fino depois que você testar.
 */
function Personagem({ peleUrl }: { peleUrl: string }) {
  const fbx = useFBX("/kenney/personagem/characterMedium.fbx");
  const idleFbx = useFBX("/kenney/personagem/animations/idle.fbx");
  const pele = useTexture(peleUrl);

  // Clona com SkeletonUtils — um clone comum não recria os ossos do
  // esqueleto, e os 7 personagens acabariam compartilhando um só.
  const modelo = useMemo(() => SkeletonUtils.clone(fbx) as THREE.Object3D, [fbx]);

  useEffect(() => {
    pele.colorSpace = THREE.SRGBColorSpace;
    modelo.traverse((objeto) => {
      const malha = objeto as THREE.Mesh;
      if (malha.isMesh) {
        malha.material = new THREE.MeshStandardMaterial({ map: pele });
        malha.castShadow = true;
      }
    });
  }, [modelo, pele]);

  const { actions } = useAnimations(idleFbx.animations, modelo);

  useEffect(() => {
    const nomeClipe = idleFbx.animations[0]?.name;
    const acao = nomeClipe ? actions[nomeClipe] : null;
    acao?.reset().fadeIn(0.3).play();
    return () => {
      acao?.fadeOut(0.2);
    };
  }, [actions, idleFbx]);

  return <primitive object={modelo} scale={0.011} />;
}

/** Mesa + cadeira + monitor (móveis reais, Kenney) com o personagem do
 * agente parado ali perto, e o nome flutuando acima. */
function EstacaoAgente({
  nome,
  peleUrl,
  posicaoX,
}: {
  nome: string;
  peleUrl: string;
  posicaoX: number;
}) {
  const { scene: mesaBase } = useGLTF("/kenney/moveis/desk.glb");
  const { scene: cadeiraBase } = useGLTF("/kenney/moveis/chairDesk.glb");
  const { scene: telaBase } = useGLTF("/kenney/moveis/computerScreen.glb");

  // Móvel estático não precisa de SkeletonUtils — um clone normal já
  // basta, porque não tem osso/animação pra preservar.
  const mesa = useMemo(() => mesaBase.clone(), [mesaBase]);
  const cadeira = useMemo(() => cadeiraBase.clone(), [cadeiraBase]);
  const tela = useMemo(() => telaBase.clone(), [telaBase]);

  return (
    <group position={[posicaoX, 0, 0]}>
      <primitive object={mesa} position={[0, 0, -0.7]} castShadow receiveShadow />
      <primitive
        object={tela}
        position={[0, 0.75, -0.88]}
        rotation={[0, Math.PI, 0]}
        castShadow
      />
      <primitive
        object={cadeira}
        position={[0, 0, 0.4]}
        rotation={[0, Math.PI, 0]}
        castShadow
        receiveShadow
      />

      <group position={[0, 0, 0.05]}>
        <Personagem peleUrl={peleUrl} />
      </group>

      <Text
        position={[0, 2.05, 0]}
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
  const espacamento = 2.8;
  const inicioX = -((AGENTES_DA_SALA.length - 1) * espacamento) / 2;

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 9, 4]} intensity={1.2} castShadow />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[42, 14]} />
        <meshStandardMaterial color="#242832" />
      </mesh>

      {AGENTES_DA_SALA.map((nome, i) => (
        <EstacaoAgente
          key={nome}
          nome={nome}
          peleUrl={PELES[i % PELES.length]!}
          posicaoX={inicioX + i * espacamento}
        />
      ))}
    </>
  );
}

function Sala3D() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <Painel
        titulo="Sala 3D"
        descricao="Os agentes, em 3D — móveis e personagens reais (Kenney), ainda parados na mesa"
      >
        <div className="h-[600px] w-full overflow-hidden rounded-b-lg bg-[#14161b]">
          <Canvas shadows camera={{ position: [0, 4.5, 11], fov: 50 }}>
            <Suspense fallback={null}>
              <CenaEscritorio />
            </Suspense>
            <OrbitControls
              enablePan
              minDistance={4}
              maxDistance={22}
              maxPolarAngle={Math.PI / 2.05}
            />
          </Canvas>
        </div>
        <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
          Modelos e móveis: pacotes Kenney (CC0), gratuitos e livres pra uso comercial. Cada
          agente ainda está parado — andar, o botão de reunião e conversar dentro da cena vêm
          na próxima etapa.
        </div>
      </Painel>
    </div>
  );
}
