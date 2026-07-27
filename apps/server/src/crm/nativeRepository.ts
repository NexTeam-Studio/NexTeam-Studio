import type { Firestore } from "firebase-admin/firestore";
import type { NativeCrmRepository } from "@nexteam/providers";
import { createContactFirestoreRepository } from "../modules/nexops/areas/clients/components/contact/server/firestoreRepository.js";
import { createRequestFirestoreRepository } from "../modules/nexops/areas/requests/components/requestCore/server/firestoreRepository.js";
import { createTenantConfigFirestoreRepository } from "../modules/nexops/areas/settings/components/tenantConfig/server/firestoreRepository.js";
import { createQuoteTemplateFirestoreRepository } from "../modules/nexops/areas/quotes/components/quoteTemplates/server/firestoreRepository.js";
import { createJobFirestoreRepository } from "../modules/nexops/areas/jobs/components/jobCore/server/firestoreRepository.js";
import { createQuoteFirestoreRepository } from "../modules/nexops/areas/quotes/components/quoteEngine/server/firestoreRepository.js";
import { createInvoiceFirestoreRepository } from "../modules/nexops/areas/invoices/components/invoiceStructure/server/firestoreRepository.js";
import { createNumberingFirestoreRepository } from "../shared/numbering/firestoreNumberingRepository.js";

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
