import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  reputationProfileSchema,
  reputationReviewSchema,
  type ReputationProfile,
  type ReputationReview
} from "./schemas.js";

export interface ReputationRepository {
  upsertReview(review: ReputationReview): Promise<ReputationReview>;
  getReview(tenantId: string, reviewId: string): Promise<ReputationReview | null>;
  listReviews(tenantId: string): Promise<ReputationReview[]>;
  saveProfile(profile: ReputationProfile): Promise<ReputationProfile>;
  getProfile(tenantId: string, profileId: string): Promise<ReputationProfile | null>;
  listProfiles(tenantId: string): Promise<ReputationProfile[]>;
}

export class InMemoryReputationRepository implements ReputationRepository {
  private readonly reviews = new Map<string, ReputationReview>();
  private readonly profiles = new Map<string, ReputationProfile>();

  async upsertReview(review: ReputationReview): Promise<ReputationReview> {
    const parsed = reputationReviewSchema.parse(review) as ReputationReview;
    this.reviews.set(parsed.id, parsed);
    return parsed;
  }

  async getReview(tenantId: string, reviewId: string): Promise<ReputationReview | null> {
    const review = this.reviews.get(reviewId);
    return review?.tenantId === tenantId ? review : null;
  }

  async listReviews(tenantId: string): Promise<ReputationReview[]> {
    return [...this.reviews.values()]
      .filter((review) => review.tenantId === tenantId)
      .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
  }

  async saveProfile(profile: ReputationProfile): Promise<ReputationProfile> {
    const parsed = reputationProfileSchema.parse(profile) as ReputationProfile;
    this.profiles.set(parsed.id, parsed);
    return parsed;
  }

  async getProfile(tenantId: string, profileId: string): Promise<ReputationProfile | null> {
    const profile = this.profiles.get(profileId);
    return profile?.tenantId === tenantId ? profile : null;
  }

  async listProfiles(tenantId: string): Promise<ReputationProfile[]> {
    return [...this.profiles.values()]
      .filter((profile) => profile.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefined(entry)])
    );
  }
  return value;
}

function asDocumentData(value: object): DocumentData {
  return removeUndefined(value) as DocumentData;
}

export class FirestoreReputationRepository implements ReputationRepository {
  constructor(private readonly db: Firestore) {}

  async upsertReview(review: ReputationReview): Promise<ReputationReview> {
    const parsed = reputationReviewSchema.parse(review) as ReputationReview;
    // @tenant-doc:reputationReviews reputationReviewSchema requires tenantId before write.
    await this.db.collection("reputationReviews").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async getReview(tenantId: string, reviewId: string): Promise<ReputationReview | null> {
    const doc = await this.db.collection("reputationReviews").doc(reviewId).get();
    if (!doc.exists) {
      return null;
    }
    const review = reputationReviewSchema.parse(doc.data()) as ReputationReview;
    return review.tenantId === tenantId ? review : null;
  }

  async listReviews(tenantId: string): Promise<ReputationReview[]> {
    const snapshot = await this.db.collection("reputationReviews").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => reputationReviewSchema.parse(doc.data()) as ReputationReview)
      .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
  }

  async saveProfile(profile: ReputationProfile): Promise<ReputationProfile> {
    const parsed = reputationProfileSchema.parse(profile) as ReputationProfile;
    // @tenant-doc:reputationProfiles reputationProfileSchema requires tenantId before write.
    await this.db.collection("reputationProfiles").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async getProfile(tenantId: string, profileId: string): Promise<ReputationProfile | null> {
    const doc = await this.db.collection("reputationProfiles").doc(profileId).get();
    if (!doc.exists) {
      return null;
    }
    const profile = reputationProfileSchema.parse(doc.data()) as ReputationProfile;
    return profile.tenantId === tenantId ? profile : null;
  }

  async listProfiles(tenantId: string): Promise<ReputationProfile[]> {
    const snapshot = await this.db.collection("reputationProfiles").where("tenantId", "==", tenantId).get();
    return snapshot.docs
      .map((doc) => reputationProfileSchema.parse(doc.data()) as ReputationProfile)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}
