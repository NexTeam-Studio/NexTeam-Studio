import type { Firestore } from "firebase-admin/firestore";
import type { NativeCrmRepository } from "@nexteam/providers";
import { createContactFirestoreRepository } from "../../areas/clients/components/contact/server/firestoreRepository.js";
import { createRequestFirestoreRepository } from "../../areas/requests/components/requestCore/server/firestoreRepository.js";
import { createTenantConfigFirestoreRepository } from "../../areas/settings/components/tenantConfig/server/firestoreRepository.js";
import { createQuoteTemplateFirestoreRepository } from "../../areas/quotes/components/quoteTemplates/server/firestoreRepository.js";
import { createJobFirestoreRepository } from "../../areas/jobs/components/jobCore/server/firestoreRepository.js";
import { createQuoteFirestoreRepository } from "../../areas/quotes/components/quoteEngine/server/firestoreRepository.js";
import { createInvoiceFirestoreRepository } from "../../areas/invoices/components/invoiceStructure/server/firestoreRepository.js";
import { createNumberingFirestoreRepository } from "../../../../shared/numbering/firestoreNumberingRepository.js";

function createFirestoreNativeCrmRepository(db: Firestore): NativeCrmRepository {
  return Object.assign(
    {},
    createContactFirestoreRepository(db),
    createRequestFirestoreRepository(db),
    createTenantConfigFirestoreRepository(db),
    createQuoteTemplateFirestoreRepository(db),
    createJobFirestoreRepository(db),
    createQuoteFirestoreRepository(db),
    createInvoiceFirestoreRepository(db),
    createNumberingFirestoreRepository(db),
  ) as NativeCrmRepository;
}

export interface FirestoreNativeCrmRepository extends NativeCrmRepository {}

export const FirestoreNativeCrmRepository = class {
  constructor(db: Firestore) {
    return createFirestoreNativeCrmRepository(db);
  }
} as new (db: Firestore) => FirestoreNativeCrmRepository;
