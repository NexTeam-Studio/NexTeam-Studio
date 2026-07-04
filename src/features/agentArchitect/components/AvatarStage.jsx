import AvatarPanel from "./AvatarPanel";
import { AvatarSpeechBubble } from "./AvatarSpeechBubble";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12
  }
};

export function AvatarStage({ speechText = "", ...avatarProps }) {
  return (
    <div style={styles.container}>
      <AvatarPanel {...avatarProps} />
      <AvatarSpeechBubble text={speechText} />
    </div>
  );
}
