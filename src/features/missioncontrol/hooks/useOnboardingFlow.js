import { useCallback, useEffect, useState } from "react";
import {
  fetchOnboardingSessions,
  fetchOnboardingSessionById,
  completeOnboardingTask,
  skipOnboardingTask,
  blockOnboardingTask,
  startOnboardingTask
} from "../services/onboardingService";
import { computeOnboardingProgress } from "../schemas/onboardingSchema";

export function useOnboardingFlow(sessionId = null) {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOnboardingSessions();
      setSessions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const session = await fetchOnboardingSessionById(id);
      setActiveSession(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    } else {
      loadSessions();
    }
  }, [sessionId, loadSession, loadSessions]);

  const refreshSession = useCallback(() => {
    if (sessionId) loadSession(sessionId);
    else loadSessions();
  }, [sessionId, loadSession, loadSessions]);

  // Optimistic UI helpers — update local state immediately, then persist
  const taskAction = useCallback(async (taskId, action, extra = "") => {
    // Optimistic update on activeSession
    if (activeSession) {
      const updatedTasks = (activeSession.tasks || []).map((task) => {
        if (task.taskId !== taskId) return task;
        switch (action) {
          case "complete":
            return { ...task, state: "complete", completedAt: new Date().toISOString() };
          case "skip":
            return { ...task, state: "skipped", notes: extra };
          case "block":
            return { ...task, state: "blocked", blockedReason: extra };
          case "start":
            return { ...task, state: "in-progress" };
          default:
            return task;
        }
      });
      const optimistic = { ...activeSession, tasks: updatedTasks, progress: computeOnboardingProgress({ tasks: updatedTasks }) };
      setActiveSession(optimistic);
    }

    let result;
    switch (action) {
      case "complete":
        result = await completeOnboardingTask(activeSession?.id || sessionId, taskId);
        break;
      case "skip":
        result = await skipOnboardingTask(activeSession?.id || sessionId, taskId, extra);
        break;
      case "block":
        result = await blockOnboardingTask(activeSession?.id || sessionId, taskId, extra);
        break;
      case "start":
        result = await startOnboardingTask(activeSession?.id || sessionId, taskId);
        break;
      default:
        result = { ok: false, errors: ["Unknown action."] };
    }

    if (!result.ok) {
      // Revert on failure
      await refreshSession();
    }

    return result;
  }, [activeSession, sessionId, refreshSession]);

  return {
    sessions,
    activeSession,
    loading,
    error,
    refreshSession,
    completeTask: (taskId) => taskAction(taskId, "complete"),
    skipTask: (taskId, reason) => taskAction(taskId, "skip", reason),
    blockTask: (taskId, reason) => taskAction(taskId, "block", reason),
    startTask: (taskId) => taskAction(taskId, "start"),
    setActiveSessionLocally: (session) => setActiveSession(session)
  };
}
