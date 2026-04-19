import { Copy, Download, Upload } from "lucide-react";
import { SeedConfig } from "../types/sim";
import { Panel } from "./Panel";

type SeedPanelProps = {
  seedConfig: SeedConfig;
  seedText: string;
  copied: boolean;
  onSeedConfigChange: (next: SeedConfig) => void;
  onSeedTextChange: (value: string) => void;
  onCopy: () => void;
  onImport: () => void;
  onExport: () => void;
};

export function SeedPanel({
  seedConfig,
  seedText,
  copied,
  onSeedConfigChange,
  onSeedTextChange,
  onCopy,
  onImport,
  onExport,
}: SeedPanelProps) {
  return (
    <Panel title="Seed">
      <div className="stack">
        <label className="field">
          <span>Current Seed</span>
          <input value={seedConfig.seed} onChange={(e) => onSeedConfigChange({ ...seedConfig, seed: e.target.value })} />
        </label>

        <textarea value={seedText} onChange={(e) => onSeedTextChange(e.target.value)} className="seed-textarea" />

        <div className="button-grid">
          <button onClick={onCopy} className="btn">
            <Copy size={16} /> {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={onImport} className="btn">
            <Upload size={16} /> Import
          </button>
          <button onClick={onExport} className="btn btn-full">
            <Download size={16} /> Export Payload
          </button>
        </div>
      </div>
    </Panel>
  );
}
