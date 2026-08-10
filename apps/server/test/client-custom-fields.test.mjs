import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { ApprovalQueueService, InMemoryApprovalQueueRepository } from "@nexteam/core";
import { MemoryNativeCrmRepository, NativeAdapter } from "@nexteam/providers";
import { CrmApprovalExecutor } from "../dist/crm/approvalExecutor.js";
import { registerCrmRoutes } from "../dist/crm/routes.js";

test("client route saves and replaces editable custom fields on an existing client", async () => {
  const repository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_custom_fields",
      tenantId: "aquatrace",
      name: "Catherine Sears",
      billingAddress: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "South Carolina",
        postalCode: "29643",
        country: "USA"
      },
      emails: ["catherine@example.test"],
      phones: ["8646171838"],
      tags: [],
      consent: { email: true, sms: true, marketing: false },
      customFields: {
        leadSource: "Google",
        "Pool Finish": "Pebble",
        "Access Window": "After 3 PM"
      }
    }]
  });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }]
    },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const firstPatch = await fetch(`${base}/api/crm/clients/client_custom_fields`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        customFields: {
          leadSource: "Referral",
          "Pool Finish": "Plaster",
          "Access Window": "Before noon"
        }
      })
    }).then((response) => response.json());

    assert.equal(firstPatch.ok, true);
    assert.deepEqual(firstPatch.client.customFields, {
      leadSource: "Referral",
      "Pool Finish": "Plaster",
      "Access Window": "Before noon"
    });

    const secondPatch = await fetch(`${base}/api/crm/clients/client_custom_fields`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        customFields: {
          leadSource: "Referral",
          "Access Window": "Weekend mornings"
        }
      })
    }).then((response) => response.json());

    assert.equal(secondPatch.ok, true);
    assert.deepEqual(secondPatch.client.customFields, {
      leadSource: "Referral",
      "Access Window": "Weekend mornings"
    });

    const persisted = await repository.listClients("aquatrace");
    assert.deepEqual(persisted[0].customFields, {
      leadSource: "Referral",
      "Access Window": "Weekend mornings"
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("client route updates mobile editor client details and the linked primary property together without creating a duplicate property", async () => {
  const repository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_mobile_edit",
      tenantId: "aquatrace",
      name: "Catherine Sears",
      company: "Aquatrace Leak Detection",
      personName: { firstName: "Catherine", lastName: "Sears" },
      displayNamePreference: "company",
      billingAddress: {
        street1: "111 Hamilton Drive",
        city: "Anderson",
        province: "South Carolina",
        postalCode: "29621",
        country: "USA"
      },
      contacts: [],
      communicationSettings: {
        quotesAndInvoices: "email",
        jobReminders: "sms",
        jobClosureFollowUps: "email",
        reviewRequests: "email",
        smsDefaultMode: "one_way"
      },
      emails: ["catherine@example.test"],
      phones: ["8646171838"],
      tags: [],
      consent: { email: true, sms: true, marketing: false },
      customFields: {
        leadSource: "Google",
        paymentTerms: "Residential default (Due upon receipt)"
      }
    }],
    properties: [{
      id: "property_mobile_edit",
      tenantId: "aquatrace",
      clientId: "client_mobile_edit",
      label: "111 Hamilton Drive",
      address: {
        street1: "111 Hamilton Drive",
        city: "Anderson",
        province: "South Carolina",
        postalCode: "29621",
        country: "USA"
      },
      access: {},
      contacts: [],
      assets: [],
      customFields: {
        gatedEntry: false
      }
    }]
  });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }]
    },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const patch = await fetch(`${base}/api/crm/clients/client_mobile_edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        name: "Christopher Sears",
        company: null,
        personName: { firstName: "Christopher", lastName: "Sears" },
        displayNamePreference: "person",
        billingAddress: null,
        billingSameAsPrimaryProperty: true,
        contacts: [{
          personName: { firstName: "Christopher", lastName: "Sears" },
          billingContact: true,
          correspondenceContact: true,
          phones: [{
            label: "Main",
            value: "8648737082",
            primary: true,
            receivesMessages: true,
            smsCapability: "mobile",
            smsMode: "one_way"
          }],
          emails: [{
            label: "Main",
            value: "chris@aquatraceleak.com",
            primary: true
          }],
          channelPreference: "both"
        }],
        communicationSettings: {
          quotesAndInvoices: "both",
          jobReminders: "both",
          jobClosureFollowUps: "email",
          reviewRequests: "both",
          smsDefaultMode: "one_way"
        },
        emails: ["chris@aquatraceleak.com"],
        phones: ["8648737082"],
        consent: { email: true, sms: true, marketing: true },
        customFields: {
          leadSource: "Referral",
          referredBy: "Timothy Steen",
          askForReview: true
        },
        primaryProperty: {
          siteName: "Fair Play Residence",
          label: "102 Kate Lane",
          address: {
            street1: "102 Kate Lane",
            city: "Fair Play",
            province: "South Carolina",
            postalCode: "29643",
            country: "USA"
          },
          geo: { lat: 34.511, lng: -82.977 },
          billingAddressSameAsClient: true,
          access: {
            gateCode: "POOL-42",
            accessNotes: "Gated entry enabled"
          },
          contacts: [{
            company: "Catherine Sears",
            role: "Property contact",
            billingContact: false,
            correspondenceContact: false,
            phones: [{
              label: "Other",
              value: "8646171838",
              primary: true,
              receivesMessages: false,
              smsCapability: "unknown",
              smsMode: "one_way"
            }],
            emails: [{
              label: "Other",
              value: "catherinesears31@gmail.com",
              primary: true
            }],
            channelPreference: "none"
          }],
          customFields: {
            gatedEntry: true,
            propertyClientName: "Catherine Sears",
            propertyClientPhone: "8646171838",
            propertyClientEmail: "catherinesears31@gmail.com"
          }
        }
      })
    }).then((response) => response.json());

    assert.equal(patch.ok, true);
    assert.equal(patch.client.name, "Christopher Sears");
    assert.equal(patch.client.company, undefined);
    assert.equal(patch.client.displayNamePreference, "person");
    assert.equal(patch.client.billingAddress, undefined);
    assert.deepEqual(patch.client.emails, ["chris@aquatraceleak.com"]);
    assert.deepEqual(patch.client.phones, ["8648737082"]);
    assert.deepEqual(patch.client.customFields, {
      leadSource: "Referral",
      referredBy: "Timothy Steen",
      askForReview: true
    });
    assert.equal(patch.client.consent.marketing, true);
    assert.equal(patch.property.address.street1, "102 Kate Lane");
    assert.equal(patch.property.customFields.gatedEntry, true);
    assert.equal(patch.property.customFields.propertyClientName, "Catherine Sears");

    const persistedClients = await repository.listClients("aquatrace");
    const persistedProperties = await repository.listProperties("aquatrace");
    assert.equal(persistedClients[0].name, "Christopher Sears");
    assert.equal(persistedClients[0].company, undefined);
    assert.deepEqual(persistedClients[0].emails, ["chris@aquatraceleak.com"]);
    assert.equal(persistedClients[0].billingAddress, undefined);
    assert.equal(persistedProperties.length, 1);
    assert.equal(persistedProperties[0].address.street1, "102 Kate Lane");
    assert.equal(persistedProperties[0].access.gateCode, "POOL-42");
    assert.equal(persistedProperties[0].customFields.propertyClientEmail, "catherinesears31@gmail.com");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("client edit route rejects blank required name, phone, and address values", async () => {
  const repository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_required_fields",
      tenantId: "aquatrace",
      name: "Catherine Sears",
      personName: { firstName: "Catherine", lastName: "Sears" },
      contacts: [],
      emails: ["catherine@example.test"],
      phones: ["8646171838"],
      tags: [],
      consent: { email: true, sms: true, marketing: false },
      customFields: {}
    }],
    properties: [{
      id: "property_required_fields",
      tenantId: "aquatrace",
      clientId: "client_required_fields",
      label: "102 Kate Lane",
      address: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "South Carolina",
        postalCode: "29643",
        country: "USA"
      },
      access: {},
      contacts: [],
      assets: [],
      customFields: {}
    }]
  });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }]
    },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const blankPhone = await fetch(`${base}/api/crm/clients/client_required_fields`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        phones: [],
        contacts: []
      })
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(blankPhone.status, 400);
    assert.match(blankPhone.body.error, /Telephone is required/i);

    const blankAddress = await fetch(`${base}/api/crm/clients/client_required_fields`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        billingAddress: null,
        primaryProperty: {
          address: {
            street1: "",
            city: "",
            province: "",
            postalCode: "",
            country: "USA"
          }
        }
      })
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(blankAddress.status, 400);
    assert.match(blankAddress.body.error, /Address is required/i);

    const blankName = await fetch(`${base}/api/crm/clients/client_required_fields`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        name: "   "
      })
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
    assert.equal(blankName.status, 400);
    assert.match(blankName.body.error, /Name is required/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("client edit route preserves untouched fields when only one field is changed", async () => {
  const repository = new MemoryNativeCrmRepository({
    clients: [{
      id: "client_partial_edit",
      tenantId: "aquatrace",
      name: "Christopher Sears",
      personName: { firstName: "Christopher", lastName: "Sears" },
      displayNamePreference: "person",
      billingAddress: {
        street1: "111 Hamilton Drive",
        city: "Anderson",
        province: "South Carolina",
        postalCode: "29621",
        country: "USA"
      },
      contacts: [{
        personName: { firstName: "Christopher", lastName: "Sears" },
        billingContact: true,
        correspondenceContact: true,
        phones: [{
          label: "Main",
          value: "8646171838",
          primary: true,
          receivesMessages: true,
          smsCapability: "mobile",
          smsMode: "one_way"
        }],
        emails: [{
          label: "Main",
          value: "chris@aquatraceleak.com",
          primary: true
        }],
        channelPreference: "both"
      }],
      communicationSettings: {
        quotesAndInvoices: "both",
        jobReminders: "both",
        jobClosureFollowUps: "email",
        reviewRequests: "both",
        smsDefaultMode: "one_way"
      },
      emails: ["chris@aquatraceleak.com"],
      phones: ["8646171838"],
      tags: [],
      consent: { email: true, sms: true, marketing: false },
      customFields: {
        leadSource: "Referral",
        referredBy: "Timothy Steen"
      }
    }],
    properties: [{
      id: "property_partial_edit",
      tenantId: "aquatrace",
      clientId: "client_partial_edit",
      label: "102 Kate Lane",
      address: {
        street1: "102 Kate Lane",
        city: "Fair Play",
        province: "South Carolina",
        postalCode: "29643",
        country: "USA"
      },
      access: {
        gateCode: "POOL-42"
      },
      contacts: [],
      assets: [],
      customFields: {
        gatedEntry: true
      }
    }]
  });
  const adapter = new NativeAdapter(repository, "aquatrace");
  const approvalQueue = new ApprovalQueueService(new InMemoryApprovalQueueRepository(), new CrmApprovalExecutor(adapter));
  const app = express();
  app.use(express.json());
  registerCrmRoutes(app, {
    approvalQueue,
    memoryRepository: repository,
    platformRepository: {
      listTenantUsers: async () => [{ id: "owner_1", tenantId: "aquatrace", displayName: "Chris", role: "OWNER", active: true, email: "owner@example.test" }]
    },
    env: { TENANT_ID: "aquatrace", NEXI_FIREBASE_AUTH_REQUIRED: "false" }
  });

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const base = `http://127.0.0.1:${address.port}`;

    const patch = await fetch(`${base}/api/crm/clients/client_partial_edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "aquatrace",
        phones: ["8648737082"]
      })
    }).then((response) => response.json());

    assert.equal(patch.ok, true);
    assert.equal(patch.client.name, "Christopher Sears");
    assert.deepEqual(patch.client.phones, ["8648737082"]);
    assert.deepEqual(patch.client.emails, ["chris@aquatraceleak.com"]);
    assert.equal(patch.client.billingAddress.street1, "111 Hamilton Drive");
    assert.deepEqual(patch.client.customFields, {
      leadSource: "Referral",
      referredBy: "Timothy Steen"
    });

    const persistedClients = await repository.listClients("aquatrace");
    const persistedProperties = await repository.listProperties("aquatrace");
    assert.equal(persistedClients[0].name, "Christopher Sears");
    assert.deepEqual(persistedClients[0].phones, ["8648737082"]);
    assert.deepEqual(persistedClients[0].emails, ["chris@aquatraceleak.com"]);
    assert.equal(persistedClients[0].billingAddress.street1, "111 Hamilton Drive");
    assert.equal(persistedProperties[0].address.street1, "102 Kate Lane");
    assert.equal(persistedProperties.length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
