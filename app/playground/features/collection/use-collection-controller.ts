import { useRef, useState } from "react";
import type { ApiRequestKind } from "../../shared/workbench-types";

/**
 * Owns collection/request dialog state and pending import routing.
 */
export function useCollectionController() {
  const [collectionMenuAnchor, setCollectionMenuAnchor] = useState<HTMLElement | null>(null);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [requestNameDialogOpen, setRequestNameDialogOpen] = useState(false);
  const [requestNameDraft, setRequestNameDraft] = useState("");
  const [requestKindDraft, setRequestKindDraft] = useState<ApiRequestKind>("websocket");
  const [requestTargetCollectionId, setRequestTargetCollectionId] = useState("");
  const pendingCollectionImportRef = useRef<string>("");

  return {
    collectionMenuAnchor,
    setCollectionMenuAnchor,
    collectionDialogOpen,
    setCollectionDialogOpen,
    collectionNameDraft,
    setCollectionNameDraft,
    requestNameDialogOpen,
    setRequestNameDialogOpen,
    requestNameDraft,
    setRequestNameDraft,
    requestKindDraft,
    setRequestKindDraft,
    requestTargetCollectionId,
    setRequestTargetCollectionId,
    pendingCollectionImportRef,
  };
}
