"use client";

import { useState } from "react";
import { Button, FormControl, MenuItem, Select } from "@/components/shadcn/compat";
import { Add } from "@/components/shadcn/icons";
import { mockCatalogStore } from "../catalog/mockCatalog.store";
import type { MockScenarioSummary } from "../catalog/mockCatalog.types";

export function MockScenarioPicker(props: {
  methodId: string;
  methodName: string;
  activeScenarioId: string;
  scenarioCount: number;
  disabled?: boolean;
  onChange(scenarioId: string): void;
  onAdd(): void;
}) {
  const { methodId, methodName, activeScenarioId, scenarioCount, disabled, onChange, onAdd } = props;
  const [options, setOptions] = useState<MockScenarioSummary[]>([]);
  const [loading, setLoading] = useState(false);

  if (scenarioCount === 0) {
    return (
      <Button size="small" variant="text" startIcon={<Add />} onClick={onAdd} disabled={disabled}>
        Add scenario
      </Button>
    );
  }

  const load = async (): Promise<void> => {
    if (loading || options.length > 0) return;
    setLoading(true);
    try {
      setOptions(await mockCatalogStore.getScenarios(methodId));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
      <Select
        value={activeScenarioId}
        displayEmpty
        disabled={disabled}
        className="grpc-mock-scenario-select"
        inputProps={{ "aria-label": `Active scenario for ${methodName}` }}
        onOpen={() => void load()}
        onChange={(event: { target: { value: unknown } }) => onChange(String(event.target.value))}
        sx={{ minHeight: 34, height: 34, fontSize: 12.5, lineHeight: "20px" }}
      >
        {activeScenarioId && !options.some((item: MockScenarioSummary) => item.id === activeScenarioId) ? (
          <MenuItem value={activeScenarioId}>{activeScenarioId}</MenuItem>
        ) : null}
        {loading ? <MenuItem value={activeScenarioId} disabled>Loading scenarios…</MenuItem> : null}
        {options.map((scenario: MockScenarioSummary) => (
          <MenuItem key={`${methodId}:${scenario.id}`} value={scenario.id}>
            {scenario.description || scenario.id}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
