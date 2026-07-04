import { useCallback, useEffect, useState } from "react";
import { fetchBlueprints, fetchBlueprintById, createBlueprint, updateBlueprint, instantiateClientFromBlueprint } from "../services/blueprintService";

export function useBlueprintLibrary() {
  const [blueprints, setBlueprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBlueprints();
      setBlueprints(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInstantiate = useCallback(async (blueprintId, clientInfo) => {
    const result = await instantiateClientFromBlueprint(blueprintId, clientInfo);
    return result;
  }, []);

  const handleCreate = useCallback(async (bpData) => {
    const result = await createBlueprint(bpData);
    if (result.ok) await load();
    return result;
  }, [load]);

  const handleUpdate = useCallback(async (blueprintId, patch) => {
    const result = await updateBlueprint(blueprintId, patch);
    if (result.ok) await load();
    return result;
  }, [load]);

  return {
    blueprints,
    loading,
    error,
    reload: load,
    handleInstantiate,
    handleCreate,
    handleUpdate,
    fetchBlueprintById
  };
}
