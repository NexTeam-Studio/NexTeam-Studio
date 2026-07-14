import { randomUUID } from "node:crypto";
import type { Firestore, DocumentData } from "firebase-admin/firestore";
import {
  clientBillingProfileSchema,
  creditSchema,
  depositSchema,
  paymentSchema,
  receiptReviewSchema,
  refundSchema,
  RailError,
  type ClientBillingProfile,
  type Credit,
  type Deposit,
  type Payment,
  type ReceiptReview,
  type Refund
} from "@nexteam/core";
import { z } from "zod";

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

export interface LedgerRepository {
  listPayments(tenantId: string): Promise<Payment[]>;
  getPayment(tenantId: string, id: string): Promise<Payment | null>;
  upsertPayment(payment: Payment): Promise<Payment>;
  listDeposits(tenantId: string): Promise<Deposit[]>;
  getDeposit(tenantId: string, id: string): Promise<Deposit | null>;
  upsertDeposit(deposit: Deposit): Promise<Deposit>;
  listRefunds(tenantId: string): Promise<Refund[]>;
  getRefund(tenantId: string, id: string): Promise<Refund | null>;
  upsertRefund(refund: Refund): Promise<Refund>;
  listCredits(tenantId: string): Promise<Credit[]>;
  getCredit(tenantId: string, id: string): Promise<Credit | null>;
  upsertCredit(credit: Credit): Promise<Credit>;
  listReceiptReviews(tenantId: string): Promise<ReceiptReview[]>;
  getReceiptReview(tenantId: string, id: string): Promise<ReceiptReview | null>;
  upsertReceiptReview(review: ReceiptReview): Promise<ReceiptReview>;
  getClientBillingProfile(tenantId: string, clientId: string): Promise<ClientBillingProfile | null>;
  upsertClientBillingProfile(profile: ClientBillingProfile): Promise<ClientBillingProfile>;
}

export class MemoryLedgerRepository implements LedgerRepository {
  private readonly payments = new Map<string, Payment>();
  private readonly deposits = new Map<string, Deposit>();
  private readonly refunds = new Map<string, Refund>();
  private readonly credits = new Map<string, Credit>();
  private readonly receiptReviews = new Map<string, ReceiptReview>();
  private readonly billingProfiles = new Map<string, ClientBillingProfile>();

  async listPayments(tenantId: string): Promise<Payment[]> {
    return [...this.payments.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getPayment(tenantId: string, id: string): Promise<Payment | null> {
    const payment = this.payments.get(id) ?? null;
    return payment?.tenantId === tenantId ? payment : null;
  }

  async upsertPayment(payment: Payment): Promise<Payment> {
    const parsed = paymentSchema.parse(payment) as Payment;
    this.payments.set(parsed.id, parsed);
    return parsed;
  }

  async listDeposits(tenantId: string): Promise<Deposit[]> {
    return [...this.deposits.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getDeposit(tenantId: string, id: string): Promise<Deposit | null> {
    const deposit = this.deposits.get(id) ?? null;
    return deposit?.tenantId === tenantId ? deposit : null;
  }

  async upsertDeposit(deposit: Deposit): Promise<Deposit> {
    const parsed = depositSchema.parse(deposit) as Deposit;
    this.deposits.set(parsed.id, parsed);
    return parsed;
  }

  async listRefunds(tenantId: string): Promise<Refund[]> {
    return [...this.refunds.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRefund(tenantId: string, id: string): Promise<Refund | null> {
    const refund = this.refunds.get(id) ?? null;
    return refund?.tenantId === tenantId ? refund : null;
  }

  async upsertRefund(refund: Refund): Promise<Refund> {
    const parsed = refundSchema.parse(refund) as Refund;
    this.refunds.set(parsed.id, parsed);
    return parsed;
  }

  async listCredits(tenantId: string): Promise<Credit[]> {
    return [...this.credits.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getCredit(tenantId: string, id: string): Promise<Credit | null> {
    const credit = this.credits.get(id) ?? null;
    return credit?.tenantId === tenantId ? credit : null;
  }

  async upsertCredit(credit: Credit): Promise<Credit> {
    const parsed = creditSchema.parse(credit) as Credit;
    this.credits.set(parsed.id, parsed);
    return parsed;
  }

  async listReceiptReviews(tenantId: string): Promise<ReceiptReview[]> {
    return [...this.receiptReviews.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getReceiptReview(tenantId: string, id: string): Promise<ReceiptReview | null> {
    const review = this.receiptReviews.get(id) ?? null;
    return review?.tenantId === tenantId ? review : null;
  }

  async upsertReceiptReview(review: ReceiptReview): Promise<ReceiptReview> {
    const parsed = receiptReviewSchema.parse(review) as ReceiptReview;
    this.receiptReviews.set(parsed.id, parsed);
    return parsed;
  }

  async getClientBillingProfile(tenantId: string, clientId: string): Promise<ClientBillingProfile | null> {
    return this.billingProfiles.get(`${tenantId}:${clientId}`) ?? null;
  }

  async upsertClientBillingProfile(profile: ClientBillingProfile): Promise<ClientBillingProfile> {
    const parsed = clientBillingProfileSchema.parse(profile) as ClientBillingProfile;
    this.billingProfiles.set(`${parsed.tenantId}:${parsed.clientId}`, parsed);
    return parsed;
  }
}

export class FirestoreLedgerRepository implements LedgerRepository {
  constructor(private readonly db: Firestore) {}

  private async listByTenant<T>(collectionName: string, tenantId: string, schema: z.ZodSchema<T>): Promise<T[]> {
    const snapshot = await this.db.collection(collectionName).where("tenantId", "==", tenantId).get();
    return snapshot.docs.map((doc) => schema.parse(doc.data()));
  }

  async listPayments(tenantId: string): Promise<Payment[]> {
    return (await this.listByTenant("ledgerPayments", tenantId, paymentSchema) as Payment[])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getPayment(tenantId: string, id: string): Promise<Payment | null> {
    const snapshot = await this.db.collection("ledgerPayments").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = paymentSchema.parse(snapshot.data()) as Payment;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertPayment(payment: Payment): Promise<Payment> {
    const parsed = paymentSchema.parse(payment) as Payment;
    await this.db.collection("ledgerPayments").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listDeposits(tenantId: string): Promise<Deposit[]> {
    return (await this.listByTenant("ledgerDeposits", tenantId, depositSchema) as Deposit[])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getDeposit(tenantId: string, id: string): Promise<Deposit | null> {
    const snapshot = await this.db.collection("ledgerDeposits").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = depositSchema.parse(snapshot.data()) as Deposit;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertDeposit(deposit: Deposit): Promise<Deposit> {
    const parsed = depositSchema.parse(deposit) as Deposit;
    await this.db.collection("ledgerDeposits").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listRefunds(tenantId: string): Promise<Refund[]> {
    return (await this.listByTenant("ledgerRefunds", tenantId, refundSchema) as Refund[])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRefund(tenantId: string, id: string): Promise<Refund | null> {
    const snapshot = await this.db.collection("ledgerRefunds").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = refundSchema.parse(snapshot.data()) as Refund;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertRefund(refund: Refund): Promise<Refund> {
    const parsed = refundSchema.parse(refund) as Refund;
    await this.db.collection("ledgerRefunds").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listCredits(tenantId: string): Promise<Credit[]> {
    return (await this.listByTenant("ledgerCredits", tenantId, creditSchema) as Credit[])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getCredit(tenantId: string, id: string): Promise<Credit | null> {
    const snapshot = await this.db.collection("ledgerCredits").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = creditSchema.parse(snapshot.data()) as Credit;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertCredit(credit: Credit): Promise<Credit> {
    const parsed = creditSchema.parse(credit) as Credit;
    await this.db.collection("ledgerCredits").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async listReceiptReviews(tenantId: string): Promise<ReceiptReview[]> {
    return (await this.listByTenant("ledgerReceiptReviews", tenantId, receiptReviewSchema) as ReceiptReview[])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getReceiptReview(tenantId: string, id: string): Promise<ReceiptReview | null> {
    const snapshot = await this.db.collection("ledgerReceiptReviews").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = receiptReviewSchema.parse(snapshot.data()) as ReceiptReview;
    return parsed.tenantId === tenantId ? parsed : null;
  }

  async upsertReceiptReview(review: ReceiptReview): Promise<ReceiptReview> {
    const parsed = receiptReviewSchema.parse(review) as ReceiptReview;
    await this.db.collection("ledgerReceiptReviews").doc(parsed.id).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }

  async getClientBillingProfile(tenantId: string, clientId: string): Promise<ClientBillingProfile | null> {
    const snapshot = await this.db.collection("clientBillingProfiles").doc(`${tenantId}_${clientId}`).get();
    if (!snapshot.exists) {
      return null;
    }
    const parsed = clientBillingProfileSchema.parse(snapshot.data()) as ClientBillingProfile;
    return parsed.tenantId === tenantId && parsed.clientId === clientId ? parsed : null;
  }

  async upsertClientBillingProfile(profile: ClientBillingProfile): Promise<ClientBillingProfile> {
    const parsed = clientBillingProfileSchema.parse(profile) as ClientBillingProfile;
    await this.db.collection("clientBillingProfiles").doc(`${parsed.tenantId}_${parsed.clientId}`).set(asDocumentData(parsed), { merge: true });
    return parsed;
  }
}

export function requireLedgerRecord<T>(value: T | null | undefined, message: string, op: string): T {
  if (!value) {
    throw new RailError(message, { provider: "native", op, status: 404 });
  }
  return value;
}

export function ledgerId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
