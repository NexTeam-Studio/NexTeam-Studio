export function useDraftAgent(initialDraft = {}) {
  return {
    draft: initialDraft,
    setDraft: () => {},
    resetDraft: () => {}
  };
}
