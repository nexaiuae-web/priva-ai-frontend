import { useCallback, useEffect, useRef, useState } from "react";

const ROOT_DROP_ID = "__root__";

function resolveDropTargetFromPoint(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  const dropEl = el?.closest("[data-folder-drop-id]");
  if (!dropEl) return null;
  const id = dropEl.getAttribute("data-folder-drop-id");
  return id || null;
}

export interface UseKnowledgeBaseDragDropOptions {
  onMove: (documentId: string, folderId: string | null) => Promise<void>;
  /** When inside a folder, allow dropping onto Root breadcrumb. */
  allowRootDrop?: boolean;
}

export function useKnowledgeBaseDragDrop({
  onMove,
  allowRootDrop = false,
}: UseKnowledgeBaseDragDropOptions) {
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const touchDragDocIdRef = useRef<string | null>(null);

  const clearDragState = useCallback(() => {
    setDraggingDocId(null);
    setDropTargetId(null);
    touchDragDocIdRef.current = null;
  }, []);

  const executeMove = useCallback(
    async (documentId: string, targetDropId: string | null) => {
      const folderId =
        targetDropId == null || targetDropId === ROOT_DROP_ID ? null : targetDropId;
      setMovingDocId(documentId);
      try {
        await onMove(documentId, folderId);
      } finally {
        setMovingDocId(null);
        clearDragState();
      }
    },
    [clearDragState, onMove],
  );

  const handleDragStart = useCallback(
    (documentId: string) => (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", documentId);
      e.dataTransfer.effectAllowed = "move";
      setDraggingDocId(documentId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleDragOver = useCallback(
    (dropId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetId(dropId);
    },
    [],
  );

  const handleDragLeave = useCallback((dropId: string) => (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget as HTMLElement;
    if (related && current.contains(related)) return;
    setDropTargetId((prev) => (prev === dropId ? null : prev));
  }, []);

  const handleDropOnTarget =
    (targetDropId: string) => async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const documentId =
        e.dataTransfer.getData("text/plain") || draggingDocId || "";
      if (!documentId) {
        clearDragState();
        return;
      }
      if (targetDropId === ROOT_DROP_ID && !allowRootDrop) {
        clearDragState();
        return;
      }
      await executeMove(documentId, targetDropId);
    };

  const handleTouchStart =
    (documentId: string) => (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchDragDocIdRef.current = documentId;
      setDraggingDocId(documentId);
    };

  const handleTouchEnd = useCallback(async () => {
    const documentId = touchDragDocIdRef.current;
    const target = dropTargetId;
    if (!documentId || !target) {
      clearDragState();
      return;
    }
    if (target === ROOT_DROP_ID && !allowRootDrop) {
      clearDragState();
      return;
    }
    await executeMove(documentId, target);
  }, [allowRootDrop, clearDragState, dropTargetId, executeMove]);

  useEffect(() => {
    if (!draggingDocId || touchDragDocIdRef.current == null) return;

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const target = resolveDropTargetFromPoint(touch.clientX, touch.clientY);
      setDropTargetId(target);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, [draggingDocId]);

  useEffect(() => {
    if (!draggingDocId || touchDragDocIdRef.current == null) return;

    const onTouchEndGlobal = () => {
      void handleTouchEnd();
    };

    document.addEventListener("touchend", onTouchEndGlobal);
    document.addEventListener("touchcancel", onTouchEndGlobal);
    return () => {
      document.removeEventListener("touchend", onTouchEndGlobal);
      document.removeEventListener("touchcancel", onTouchEndGlobal);
    };
  }, [draggingDocId, handleTouchEnd]);

  const dropHighlightClass = (dropId: string) =>
    dropTargetId === dropId
      ? "ring-2 ring-[#00E699]/70 bg-[#054232]/55 shadow-[0_0_16px_rgba(0,230,153,0.15)]"
      : "";

  const isDropTargetActive = (dropId: string) => dropTargetId === dropId;

  return {
    ROOT_DROP_ID,
    draggingDocId,
    movingDocId,
    dropHighlightClass,
    isDropTargetActive,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDropOnTarget,
    handleTouchStart,
    clearDragState,
  };
}
