export type ResponseSelectorSource<TSnapshot> = {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
};

export type ResponseSelectorEquality<TSelected> = (left: TSelected, right: TSelected) => boolean;

export type ResponseSelectorBinding<TSelected> = {
  getSnapshot(): TSelected;
  subscribe(listener: () => void): () => void;
};

/**
 * Adapts a broad external-store subscription into a selected subscription.
 * The React listener is only notified when the selected value changes.
 */
export function createResponseSelectorBinding<TSnapshot, TSelected>(
  source: ResponseSelectorSource<TSnapshot>,
  selector: (snapshot: TSnapshot) => TSelected,
  equality: ResponseSelectorEquality<TSelected> = Object.is,
): ResponseSelectorBinding<TSelected> {
  let initialized = false;
  let selectedValue: TSelected;

  const getSnapshot = (): TSelected => {
    const nextValue = selector(source.getSnapshot());
    if (!initialized || !equality(selectedValue, nextValue)) {
      selectedValue = nextValue;
      initialized = true;
    }
    return selectedValue;
  };

  return {
    getSnapshot,
    subscribe(listener) {
      let previousValue = getSnapshot();
      return source.subscribe(() => {
        const nextValue = getSnapshot();
        if (Object.is(previousValue, nextValue)) return;
        previousValue = nextValue;
        listener();
      });
    },
  };
}
