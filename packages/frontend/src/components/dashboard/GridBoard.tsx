import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import type { DashboardRow, DashboardSpec, GridItem } from "@email-os/shared";
import { GRID_COLS, reconcileLayout } from "@email-os/shared";
import { ComponentCard } from "./renderers";

const MIN_SIZE: Record<string, { minW: number; minH: number }> = {
  kpi: { minW: 2, minH: 2 },
  table: { minW: 4, minH: 4 },
  timeline: { minW: 3, minH: 4 },
  funnel: { minW: 3, minH: 3 },
  barlist: { minW: 3, minH: 3 },
  column: { minW: 3, minH: 3 },
};

/** If react-grid-layout ever throws (e.g. a React version quirk), fall back to a plain stack. */
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GridBoard({
  spec,
  rows,
  editing,
  onLayoutChange,
  onOpenEvidence,
  onOpenThread,
}: {
  spec: DashboardSpec;
  rows: DashboardRow[];
  editing: boolean;
  onLayoutChange: (layout: GridItem[]) => void;
  onOpenEvidence: (title: string, rows: DashboardRow[]) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const layout = useMemo<Layout[]>(
    () =>
      reconcileLayout(spec, spec.layout).map((g) => {
        const c = spec.components.find((x) => x.id === g.i);
        const min = (c && MIN_SIZE[c.type]) ?? { minW: 2, minH: 2 };
        return { ...g, ...min };
      }),
    [spec]
  );
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const updateHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(([entry]) => setBoardWidth(entry.contentRect.width));
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  const totalRows = Math.max(1, ...layout.map((item) => item.y + item.h));
  // Keep the working dashboard in one viewport. Detail stays available through
  // pagination and the source drawer instead of forcing page-level scrolling.
  const rowHeight = editing
    ? 36
    : Math.max(22, Math.min(36, Math.floor((viewportHeight - 228 - (totalRows - 1) * 16) / totalRows)));

  const tiles = spec.components.map((c) => (
    <div key={c.id} className="overflow-hidden">
      <ComponentCard
        component={c}
        rows={rows}
        spec={spec}
        editing={editing}
        onOpenEvidence={onOpenEvidence}
        onOpenThread={onOpenThread}
      />
    </div>
  ));

  const stacked = (
    <div className="flex flex-col gap-4">
      {spec.components.map((c) => (
        <div key={c.id} className="min-h-[200px]">
          <ComponentCard
            component={c}
            rows={rows}
            spec={spec}
            editing={false}
            onOpenEvidence={onOpenEvidence}
            onOpenThread={onOpenThread}
          />
        </div>
      ))}
    </div>
  );

  return (
    <Boundary fallback={stacked}>
      <div ref={boardRef} className="min-w-0 w-full">
        {boardWidth > 0 && (
          <GridLayout
            width={boardWidth}
            className={`layout ${editing ? "layout-editing" : ""}`}
            layout={layout}
            cols={GRID_COLS}
            rowHeight={rowHeight}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            isDraggable={editing}
            isResizable={editing}
            draggableHandle=".drag-handle"
            compactType="vertical"
            onLayoutChange={(next: Layout[]) =>
              onLayoutChange(next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))
            }
          >
            {tiles}
          </GridLayout>
        )}
      </div>
    </Boundary>
  );
}
