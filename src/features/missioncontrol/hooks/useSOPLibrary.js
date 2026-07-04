import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSOPs, fetchSOPById, createSOP, updateSOP, transitionSOP, duplicateSOP } from "../services/sopService";

export function useSOPLibrary({ initialState = null, initialCategory = null } = {}) {
  const [sops, setSOPs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterState, setFilterState] = useState(initialState);
  const [filterCategory, setFilterCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSOPs({ state: filterState, category: filterCategory });
      setSOPs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterState, filterCategory]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSOPs = useMemo(() => {
    if (!searchQuery.trim()) return sops;
    const lower = searchQuery.toLowerCase();
    return sops.filter(
      (sop) =>
        sop.title?.toLowerCase().includes(lower) ||
        sop.description?.toLowerCase().includes(lower) ||
        sop.tags?.some((tag) => tag.toLowerCase().includes(lower)) ||
        sop.category?.toLowerCase().includes(lower)
    );
  }, [sops, searchQuery]);

  const handleTransition = useCallback(async (sopId, action) => {
    const result = await transitionSOP(sopId, action);
    if (result.ok) await load();
    return result;
  }, [load]);

  const handleDuplicate = useCallback(async (sopId) => {
    const result = await duplicateSOP(sopId);
    if (result.ok) await load();
    return result;
  }, [load]);

  const handleCreate = useCallback(async (sopData) => {
    const result = await createSOP(sopData);
    if (result.ok) await load();
    return result;
  }, [load]);

  const handleUpdate = useCallback(async (sopId, patch) => {
    const result = await updateSOP(sopId, patch);
    if (result.ok) await load();
    return result;
  }, [load]);

  return {
    sops: filteredSOPs,
    allSOPs: sops,
    loading,
    error,
    filterState,
    filterCategory,
    searchQuery,
    setFilterState,
    setFilterCategory,
    setSearchQuery,
    reload: load,
    handleTransition,
    handleDuplicate,
    handleCreate,
    handleUpdate,
    fetchSOPById
  };
}
