import type { DocumentSessionAction, DocumentSessionState } from "./documentSession.types";

export function createDocumentSessionState(): DocumentSessionState {
  return { status: "idle", generation: 0 };
}

export function documentSessionReducer(
  state: DocumentSessionState,
  action: DocumentSessionAction,
): DocumentSessionState {
  switch (action.type) {
    case "request":
      return {
        ...state,
        status: "preparing",
        requested: action.target,
        pending: { target: action.target, generation: action.generation },
        committed: state.committed,
        generation: action.generation,
        error: undefined,
      };
    case "prepared": {
      const pending = state.pending;
      if (!pending || action.generation !== state.generation || pending.generation !== action.generation) return state;
      if (pending.target.documentId !== action.target.documentId) return state;
      return {
        status: "ready",
        requested: action.target,
        pending: undefined,
        committed: { target: action.target, preparedWindow: action.preparedWindow },
        generation: action.generation,
        error: undefined,
      };
    }
    case "failed": {
      const pending = state.pending;
      if (!pending || action.generation !== state.generation || pending.generation !== action.generation) return state;
      return {
        ...state,
        status: state.committed ? "ready" : "error",
        pending: undefined,
        error: action.error,
      };
    }
    case "clear":
      return createDocumentSessionState();
    default:
      return state;
  }
}
