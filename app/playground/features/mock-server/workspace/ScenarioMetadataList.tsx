"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Box, Button, Paper, TextField, Typography } from "@/components/shadcn/compat";
import { useFixedVirtualWindow } from "../../../shared/use-fixed-virtual-window";

type ScenarioRef = { methodKey: string; scenarioId: string };
type ScenarioSummary = ScenarioRef & { name: string; revision: number };

/** Search and scrolling stay local; typing never rerenders the payload editor. */
export function ScenarioMetadataList({ items, selected, onChoose }: {
  items: ScenarioSummary[];
  selected: ScenarioRef | null;
  onChoose(ref: ScenarioRef): Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase());
  const searchable = useMemo(() => items.map(item => ({ item,
    text: `${item.methodKey} ${item.scenarioId} ${item.name}`.toLowerCase(),
  })), [items]);
  const filtered = useMemo(() => searchable.filter(entry => !deferredFilter || entry.text.includes(deferredFilter)),
    [searchable, deferredFilter]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const windowed = useFixedVirtualWindow({ count: filtered.length, itemSize: 34, overscan: 8, scrollRef });
  return <Paper variant="outlined" sx={{ width: { xs: "100%", md: 300 }, height: "100%", p: 1, minHeight: 0,
    overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <TextField fullWidth size="small" value={filter} placeholder="Search scenarios"
      onChange={(event: { target: { value: string } }) => {
        setFilter(event.target.value);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      }} />
    <Typography variant="caption" color="text.secondary">{filtered.length} {filtered.length === 1 ? "scenario" : "scenarios"}</Typography>
    <Box ref={scrollRef} onScroll={windowed.onScroll} sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
      <Box sx={{ height: windowed.totalSize, position: "relative" }}>
        {windowed.items.map(row => {
          const { item } = filtered[row.index];
          return (
          <Button key={JSON.stringify([item.methodKey, item.scenarioId])}
            variant={selected?.methodKey === item.methodKey && selected.scenarioId === item.scenarioId ? "contained" : "text"}
            size="small" sx={{ position: "absolute", top: row.start,
              height: 34, width: "100%", justifyContent: "flex-start", textTransform: "none", overflow: "hidden" }}
            onClick={() => void onChoose(item)} title={`${item.methodKey}\n${item.scenarioId}`}>
            {item.name} · v{item.revision}
          </Button>);
        })}
      </Box>
    </Box>
  </Paper>;
}
