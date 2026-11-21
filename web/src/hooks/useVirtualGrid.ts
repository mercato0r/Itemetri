import { useVirtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";

export const GRID_ROW_HEIGHT = 32;
export const GRID_COL_WIDTH = 72;

interface UseVirtualGridOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  totalRows: number;
  totalCols: number;
}

export function useVirtualGrid({
  scrollRef,
  totalRows,
  totalCols,
}: UseVirtualGridOptions) {
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT,
    overscan: 8,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: totalCols,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_COL_WIDTH,
    overscan: 6,
  });

  const rowItems = rowVirtualizer.getVirtualItems();
  const colItems = colVirtualizer.getVirtualItems();

  const totalRowHeight = rowVirtualizer.getTotalSize();
  const topPad = rowItems[0]?.start ?? 0;
  const lastRowEnd = rowItems[rowItems.length - 1]?.end ?? 0;
  const bottomPad = Math.max(0, totalRowHeight - lastRowEnd);

  const totalColWidth = colVirtualizer.getTotalSize();
  const leftPad = colItems[0]?.start ?? 0;
  const lastColEnd = colItems[colItems.length - 1]?.end ?? 0;
  const rightPad = Math.max(0, totalColWidth - lastColEnd);

  return {
    rowItems,
    colItems,
    topPad,
    bottomPad,
    leftPad,
    rightPad,
    scrollToCell: (rowIdx: number, colIdx: number) => {
      if (rowIdx >= 0 && rowIdx < totalRows) {
        rowVirtualizer.scrollToIndex(rowIdx, { align: "auto" });
      }
      if (colIdx >= 0 && colIdx < totalCols) {
        colVirtualizer.scrollToIndex(colIdx, { align: "auto" });
      }
    },
  };
}
