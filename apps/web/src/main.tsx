import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./features/quotes/components/quoteTemplates/quoteTemplates.css";
import "./features/jobs/components/jobCore/jobCore.css";
import "./features/visits/components/visitCore/visitCore.css";
import "./features/invoices/components/invoiceStructure/invoiceStructure.css";
import "./features/invoices/components/paymentRails/paymentRails.css";
import "./features/nexopsShell/documentPrimitives.css";
import "./features/quotes/components/quoteEngine/quoteEngine.css";
import "./features/settings/components/catalog/catalog.css";
import "./features/settings/components/tenantConfig/tenantConfig.css";
import { AppBootstrap } from "./shared/app/AppBootstrap";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<AppBootstrap />);
}
