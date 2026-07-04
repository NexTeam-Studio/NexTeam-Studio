import { AVATAR_STATES } from "../constants/avatarStates";

/**
 * Maps XState machine states → logical AVATAR_STATES.
 * Used to drive the avatar from machine state when no explicit avatarState
 * is set in context.
 */
export const avatarStateMap = {
  idle:       AVATAR_STATES.IDLE,
  booting:    AVATAR_STATES.IDLE,
  ready:      AVATAR_STATES.LISTENING,
  submitting: AVATAR_STATES.THINKING,
  streaming:  AVATAR_STATES.SPEAKING,
  extracting: AVATAR_STATES.THINKING,
  reviewing:  AVATAR_STATES.IDLE,
  completed:  AVATAR_STATES.IDLE,
  error:      AVATAR_STATES.REACT_NEGATIVE
};

/**
 * Resolve the avatar display state from multiple signals.
 * Priority: explicit isStreaming/isSpeaking signals > machine avatarState > machine state
 */
export function resolveAvatarState({ isStreaming, isSpeaking, machineAvatarState, machineState }) {
  if (isStreaming || isSpeaking) return AVATAR_STATES.SPEAKING;
  if (machineAvatarState) return machineAvatarState;
  return avatarStateMap[machineState] ?? AVATAR_STATES.IDLE;
}
