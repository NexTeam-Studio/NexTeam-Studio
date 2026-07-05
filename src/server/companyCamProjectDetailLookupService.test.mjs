import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompanyCamProjectDetailQuestion } from "./companyCamProjectDetailLookupService.js";

test("project-detail lookup resolves technician via CompanyCam project photos and document alias scoring", async () => {
  const companyCamRail = {
    async searchProjects({ query }) {
      const normalizedQuery = String(query || "").toLowerCase();
      if (normalizedQuery === "l3 campus") {
        return [
          {
            id: "107515958",
            name: "L3 Campus",
            status: "active",
            address: {
              street_address_1: "600 West Lafayette Street",
              city: "Tallahassee",
              state: "Florida",
              postal_code: "32304",
            },
          },
          {
            id: "106305354",
            name: "L3 Campus",
            status: "active",
            address: {
              street_address_1: "Statehouse Madison",
              city: "Tallahassee",
              state: "Florida",
              postal_code: "32304",
            },
          },
        ];
      }

      if (normalizedQuery === "statehouse arena") {
        return [];
      }

      return [];
    },
    async listProjectDocuments(projectId) {
      if (projectId === "107515958") {
        return [
          {
            id: "doc-arena",
            name: "L3 Campus - Statehouse Arena.pdf",
            content_type: "application/pdf",
            updated_at: 200,
            url: "mock://arena",
          },
        ];
      }

      return [
        {
          id: "doc-madison",
          name: "L3 Campus - Statehouse Madison.pdf",
          content_type: "application/pdf",
          updated_at: 199,
          url: "mock://madison",
        },
      ];
    },
    async listProjectPhotos(projectId) {
      if (projectId === "107515958") {
        return [
          { id: "photo-1", creator_name: "Chris Sears" },
          { id: "photo-2", creator_name: "Chris Sears" },
        ];
      }

      return [{ id: "photo-3", creator_name: "Someone Else" }];
    },
  };

  const result = await resolveCompanyCamProjectDetailQuestion({
    companyCamRail,
    tenantId: "aquatrace",
    question: "Who was the technician on Statehouse Arena pool for L3 Campus?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.project.id, "107515958");
  assert.equal(result.answer.fieldLabel, "Technician");
  assert.equal(result.answer.displayValue, "Chris Sears");
  assert.match(result.answerText, /Statehouse Arena/i);
});

test("project-detail lookup returns address details for Oleta Falls Community", async () => {
  const companyCamRail = {
    async searchProjects({ query }) {
      const normalizedQuery = String(query || "").toLowerCase();
      if (normalizedQuery === "oleta falls community" || normalizedQuery === "oleta falls") {
        return [
          {
            id: "108208595",
            name: "Oleta Falls Community",
            status: "active",
            address: {
              street_address_1: "765 Oleta Mill Trail",
              city: "Hendersonville",
              state: "North Carolina",
              postal_code: "28792",
            },
          },
        ];
      }

      return [];
    },
    async listProjectDocuments() {
      return [];
    },
    async listProjectPhotos() {
      return [];
    },
  };

  const result = await resolveCompanyCamProjectDetailQuestion({
    companyCamRail,
    tenantId: "aquatrace",
    question: "Where is Oleta Falls Community?",
  });

  assert.equal(result.ok, true);
  assert.equal(result.project.id, "108208595");
  assert.match(result.answer.displayValue, /765 Oleta Mill Trail/);
});
