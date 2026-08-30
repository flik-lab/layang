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
  const [requestKindDraft, setRequestKindDraft] = useState<ApiRequestKind | "">("");
  const [requestGrpcLibraryIdDraft, setRequestGrpcLibraryIdDraft] = useState("");
  const [requestGrpcVersionIdDraft, setRequestGrpcVersionIdDraft] = useState("");
  const [requestGrpcMethodKeyDraft, setRequestGrpcMethodKeyDraft] = useState("");
  const [requestGrpcBatchMethodKeysDraft, setRequestGrpcBatchMethodKeysDraft] = useState<string[]>([]);
  const [requestGrpcSelectionModeDraft, setRequestGrpcSelectionModeDraft] = useState<"single" | "multi">("single");
  const [requestGrpcSkipExistingDraft, setRequestGrpcSkipExistingDraft] = useState(true);
  const [requestTargetCollectionId, setRequestTargetCollectionId] = useState("");
  const [requestTargetFolderId, setRequestTargetFolderId] = useState<string | null>(null);
  const [requestLocationEditable, setRequestLocationEditable] = useState(false);
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
    requestGrpcLibraryIdDraft,
    setRequestGrpcLibraryIdDraft,
    requestGrpcVersionIdDraft,
    setRequestGrpcVersionIdDraft,
    requestGrpcMethodKeyDraft,
    setRequestGrpcMethodKeyDraft,
    requestGrpcBatchMethodKeysDraft,
    setRequestGrpcBatchMethodKeysDraft,
    requestGrpcSelectionModeDraft,
    setRequestGrpcSelectionModeDraft,
    requestGrpcSkipExistingDraft,
    setRequestGrpcSkipExistingDraft,
    requestTargetCollectionId,
    setRequestTargetCollectionId,
    requestTargetFolderId,
    setRequestTargetFolderId,
    requestLocationEditable,
    setRequestLocationEditable,
    pendingCollectionImportRef,
  };
}
