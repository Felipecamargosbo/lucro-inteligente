import { CalendarDays } from "lucide-react";
import { usePeriodo } from "@/context/periodo";
import { PRESETS, type PresetPeriodo } from "@/lib/period";
import { formatData, paraInputDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function SeletorPeriodo() {
  const { preset, setPreset, inicioPersonalizado, fimPersonalizado, setPersonalizado, periodo } =
    usePeriodo();

  const rotulo =
    preset === "personalizado"
      ? `${formatData(periodo.inicio)} — ${formatData(periodo.fim)}`
      : PRESETS.find((p) => p.id === preset)?.rotulo;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-medium">
          <CalendarDays className="size-4 text-muted-foreground" />
          {rotulo}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="space-y-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id as PresetPeriodo)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                preset === p.id
                  ? "bg-brand-soft font-semibold text-brand"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        {preset === "personalizado" && (
          <div className="mt-3 space-y-3 border-t pt-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data inicial</Label>
              <Input
                type="date"
                value={paraInputDate(inicioPersonalizado)}
                onChange={(e) =>
                  setPersonalizado(new Date(`${e.target.value}T00:00:00`), fimPersonalizado)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data final</Label>
              <Input
                type="date"
                value={paraInputDate(fimPersonalizado)}
                onChange={(e) =>
                  setPersonalizado(inicioPersonalizado, new Date(`${e.target.value}T00:00:00`))
                }
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
