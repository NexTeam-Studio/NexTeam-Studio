export async function plantedUnscopedQuery(db: { collection: (name: string) => { get: () => Promise<unknown> } }): Promise<unknown> {
  return db.collection("jobs").get();
}
