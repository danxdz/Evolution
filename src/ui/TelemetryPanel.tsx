import { Stats } from "../types/sim";
import { Panel } from "./Panel";

type TelemetryPanelProps = {
  stats: Stats | null;
};

export function TelemetryPanel({ stats }: TelemetryPanelProps) {
  return (
    <Panel title="Telemetry">
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Generation</div>
          <div className="metric-value">{stats?.generation ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Occupied</div>
          <div className="metric-value">{stats?.occupied ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Charged</div>
          <div className="metric-value">{stats?.charged ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Stable</div>
          <div className="metric-value">{stats?.stable ?? 0}</div>
        </div>
      </div>

      <div className="metric-grid metric-grid-small">
        <div className="metric-card">
          <div className="metric-label">Entropy</div>
          <div className="metric-value-small">{stats?.entropy.toFixed(2) ?? "0.00"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Births</div>
          <div className="metric-value-small">{stats?.birthsLastStep ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Deaths</div>
          <div className="metric-value-small">{stats?.deathsLastStep ?? 0}</div>
        </div>
      </div>
    </Panel>
  );
}
