import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createActor } from "xstate";
import { agentArchitectMachine } from "../machine/agentArchitectMachine";

export function useAgentArchitectSession() {
  const actorRef = useMemo(() => createActor(agentArchitectMachine), []);

  useEffect(() => {
    actorRef.start();

    return () => {
      actorRef.stop();
    };
  }, [actorRef]);

  const send = useMemo(() => {
    return (event) => actorRef.send(event);
  }, [actorRef]);

  return {
    actorRef,
    send
  };
}

export function useAgentArchitectSelector(actorRef, selector) {
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = actorRef.subscribe(() => {
        onStoreChange();
      });

      return () => {
        subscription.unsubscribe();
      };
    },
    () => selector(actorRef.getSnapshot()),
    () => selector(actorRef.getSnapshot())
  );
}
