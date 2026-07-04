const styles = {
  card: {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: 16,
    background: "#F9FAFB"
  },
  title: {
    margin: "0 0 10px 0",
    color: "#4F46E5",
    fontSize: 16
  },
  pre: {
    margin: 0,
    fontSize: 12,
    whiteSpace: "pre-wrap",
    color: "#374151"
  }
};

export function ConfigPreviewDrawer({ draftPatch = {} }) {
  const hasData = Object.keys(draftPatch).length > 0;

  return (
    <section style={styles.card}>
      <h2 style={styles.title}>Draft Blueprint Data</h2>
      <pre style={styles.pre}>{hasData ? JSON.stringify(draftPatch, null, 2) : "Nexi will start building this blueprint as details come in."}</pre>
    </section>
  );
}
