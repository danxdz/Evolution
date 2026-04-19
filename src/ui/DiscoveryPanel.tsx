import { Eye } from "lucide-react";
import { Discovery } from "../types/sim";
import { Badge } from "./Badge";
import { Panel } from "./Panel";

type DiscoveryPanelProps = {
  discoveries: Discovery[];
};

export function DiscoveryPanel({ discoveries }: DiscoveryPanelProps) {
  return (
    <Panel title="Codex / Discoveries" className="panel-fill">
      <div className="panel-hint">
        <Eye size={14} />
        Heuristic discovery stream. Deterministic for the same seed and config.
      </div>

      <div className="discovery-list">
        {discoveries.length === 0 ? (
          <div className="empty-state">No notable discoveries yet. Let the world evolve a little longer.</div>
        ) : (
          discoveries.map((d) => (
            <article key={d.id} className="discovery-card">
              <div className="discovery-head">
                <div className="discovery-badges">
                  <Badge tone={d.rarity === "rare" ? "rare" : "default"}>{d.rarity}</Badge>
                  <Badge>{d.kind}</Badge>
                </div>
                <div className="gen-text">Gen {d.generation}</div>
              </div>
              <div className="discovery-detail">{d.detail}</div>
            </article>
          ))
        )}
      </div>
    </Panel>
  );
}
