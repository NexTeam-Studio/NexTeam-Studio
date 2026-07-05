import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompanyCamProjectPhotos } from "./companyCamPhotoLookupService.js";

test("resolveCompanyCamProjectPhotos returns project photos for a matched project", async () => {
  const companyCamRail = {
    searchProjects: async () => [
      {
        id: "project-1",
        name: "Camp Mikell",
        status: "active",
        address: { street_address_1: "237 Camp Mikell Court", city: "Toccoa", state: "GA", postal_code: "30577" },
      },
    ],
    listProjectPhotos: async () => [
      { id: "photo-1", project_id: "project-1", photo_url: "https://example.com/photo-1.jpg", description: "Pool view" },
      { id: "photo-2", project_id: "project-1", photo_url: "https://example.com/photo-2.jpg", description: "Equipment" },
    ],
  };

  const result = await resolveCompanyCamProjectPhotos({
    companyCamRail,
    tenantId: "aquatrace",
    question: "Show me photos from Camp Mikell.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.project.id, "project-1");
  assert.equal(result.photos.length, 2);
  assert.match(result.answerText, /Camp Mikell/);
});
