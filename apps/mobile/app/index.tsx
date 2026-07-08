import { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MobileOfflineController, InMemoryMobileStore } from "../src/index";
import { createMobileRemoteAdapter } from "../src/native/apiClient";

const TENANT_ID = "aquatrace";
const FIELD_USER_ID = "tech_chris";
const TODAY = "2026-07-07";

export default function FieldHomeScreen() {
  const [online, setOnline] = useState(true);
  const controller = useMemo(() => new MobileOfflineController({
    store: new InMemoryMobileStore(),
    remote: createMobileRemoteAdapter({
      baseUrl: "https://nexteam-studio-staging.up.railway.app",
      tokenProvider: async () => null
    })
  }), []);
  const nexi = controller.getNexiConnectionState();
  const status = online ? "Online" : "Airplane mode";

  controller.setOnline(online);

  return (
    <SafeAreaView style={styles.shell}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>NexTeam Field</Text>
          <Text style={styles.title}>Today stays saved, even without signal.</Text>
          <Text style={styles.copy}>
            Cached schedule, checklists, photos with GPS/time, close-out notes, approvals, and sync review all run through the offline controller.
          </Text>
          <TouchableOpacity style={styles.toggle} onPress={() => setOnline((value) => !value)}>
            <Text style={styles.toggleText}>Switch to {online ? "airplane-mode receipt" : "online sync"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          <Capability title="Cached Day" value={`${TENANT_ID} / ${FIELD_USER_ID} / ${TODAY}`} />
          <Capability title="Checklists" value="Fill locally first, sync on reconnect" />
          <Capability title="Photo Queue" value="EXIF GPS + timestamp required" />
          <Capability title="Approvals" value="Owner/admin queue, no direct sends" />
          <Capability title="Push" value="Device token registered per tenant user" />
          <Capability title="Nexi" value={online ? nexi.message : "Nexi needs internet. Field work still saves here."} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>Connection</Text>
          <Text style={styles.footerValue}>{status}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Capability(props: { title: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.cardValue}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#071512"
  },
  content: {
    padding: 20,
    gap: 16
  },
  hero: {
    backgroundColor: "#10231f",
    borderColor: "#1f5f52",
    borderRadius: 28,
    borderWidth: 1,
    padding: 22
  },
  kicker: {
    color: "#70e0c4",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    color: "#f6fffb",
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 36,
    marginTop: 10
  },
  copy: {
    color: "#b9d8d0",
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12
  },
  toggle: {
    backgroundColor: "#f0b429",
    borderRadius: 18,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  toggleText: {
    color: "#10231f",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center"
  },
  grid: {
    gap: 12
  },
  card: {
    backgroundColor: "#0d1d1a",
    borderColor: "#24443d",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16
  },
  cardTitle: {
    color: "#f6fffb",
    fontSize: 18,
    fontWeight: "800"
  },
  cardValue: {
    color: "#aac7bf",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  footer: {
    alignItems: "center",
    borderColor: "#24443d",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16
  },
  footerLabel: {
    color: "#70e0c4",
    fontWeight: "800"
  },
  footerValue: {
    color: "#ffffff",
    fontWeight: "900"
  }
});
