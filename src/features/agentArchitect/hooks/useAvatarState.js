import { AVATAR_STATES } from "../constants/avatarStates";

/**
 * Maps a logical avatar state to the correct Rive animation name.
 * Keep this in sync with what the .riv file actually exports.
 *
 * Rive file exports (case-sensitive):
 *   idle | Listening | Speaking
 *
 * We fall back to "idle" for any states the Rive file doesn't have a
 * dedicated animation for (thinking, react_negative). The glow color
 * in AvatarPanel still reflects the true logical state.
 */
const RIVE_ANIMATION_MAP = {
  [AVATAR_STATES.IDLE]:            "idle",
  [AVATAR_STATES.LISTENING]:       "Listening",
  [AVATAR_STATES.THINKING]:        "idle",        // no thinking anim yet; glow distinguishes
  [AVATAR_STATES.SPEAKING]:        "Speaking",
  [AVATAR_STATES.REACT_POSITIVE]:  "Speaking",
  [AVATAR_STATES.REACT_NEGATIVE]:  "idle"
};

export function useAvatarState(conversationState) {
  const riveInputName = RIVE_ANIMATION_MAP[conversationState] ?? "idle";
  return { riveInputName };
}
