import test from "node:test";
import assert from "node:assert/strict";

import {
  answerCompanyCamReportQuestion,
  assertAquatraceCompanyCamTenantScope,
  buildProjectSearchQueries,
  companyCamQuestionServiceInternals,
  extractAverageDepthFromText,
  extractGallonsPerInchFromText,
  extractMeasurementSummaryFromText,
  extractReportFindingsFromText,
  extractSquareFootageFromText,
  extractTotalGallonsFromText,
  formatCompanyCamReportAnswer,
  scoreProjectAgainstQuestion,
} from "./companyCamQuestionService.js";

const CAMP_MIKELL_EXCERPT = `
Square Footage (Surface Area)
2,872 sq ft
Estimated Average Depth (Inches)
56"
Estimated Approximate Gallons / Inch (Square Footage x .625)
1,795 Gallons/Inch
Estimated Approximate Total Gallons
101,000 Gallons
Swimming Pool Measurements
`;

const CAMP_MIKELL_FINDINGS_EXCERPT = `
Swimming Pool Leak Detection Details /Results
-- 2 of 23 --
An estimated 1700 gallons daily water loss are occurring backwash line.
An estimated 2,000 gallons are occurring at main drain number three. There is a defect under the main drain cover within the pool structure.
Swimming Pool Entry Corner Left Plaster defect and missing grout at two tiles. A small amount of water loss present at this area.
Skimmer 5 Multiple tile defects in proximity to skimmer 5. Missing grout within skimmer 5 throat. A small amount of water loss is present at this area.
-- 12 of 23 --
Project Conditions Upon Arrival
`;

const CAMP_MIKELL_PROJECT = {
  id: "106765062",
  name: "Alex Mastej",
  address: {
    street_address_1: "237 Camp Mikell Court",
    city: "Toccoa",
    state: "Georgia",
    postal_code: "30577",
  },
};

const OTHER_TOCCOA_PROJECT = {
  id: "70892670",
  name: "Brenda Bigley",
  address: {
    street_address_1: "1222 Camp Mikell Road",
    city: "Toccoa",
    state: "Georgia",
    postal_code: "30577",
  },
};

test("Aquatrace-only CompanyCam tenant scope rejects other tenants", () => {
  assert.equal(assertAquatraceCompanyCamTenantScope("aquatrace"), "aquatrace");
  assert.equal(assertAquatraceCompanyCamTenantScope("aquatrace-case-study"), "aquatrace-case-study");
  assert.throws(
    () => assertAquatraceCompanyCamTenantScope("other-client"),
    /not approved for tenant/i
  );
});

test("total gallons extractor pulls the numeric gallons answer from report text", () => {
  const result = extractTotalGallonsFromText(CAMP_MIKELL_EXCERPT);

  assert.equal(result.fieldLabel, "Estimated Approximate Total Gallons");
  assert.equal(result.rawValue, "101,000");
  assert.equal(result.numericValue, 101000);
  assert.equal(result.displayValue, "101,000 Gallons");
  assert.match(result.evidenceSnippet, /Estimated Approximate Total Gallons/i);
});

test("total gallons extractor accepts checklist text that says Gallon singular", () => {
  const result = extractTotalGallonsFromText(`
Estimated Approximate Gallons / Inch (Square Footage x .625)
654 Gallons/ Inch
Estimated Approximate Total Gallons
24,250 Gallon
`);

  assert.equal(result.rawValue, "24,250");
  assert.equal(result.numericValue, 24250);
  assert.equal(result.displayValue, "24,250 Gallons");
});

test("square footage extractor pulls decimal surface area values from report text", () => {
  const result = extractSquareFootageFromText(`
Square Footage (Surface Area)
496.4ft²
Estimated Average Depth (Inches)
42in
`);

  assert.equal(result.rawValue, "496.4");
  assert.equal(result.numericValue, 496.4);
  assert.equal(result.displayValue, "496.4 ft²");
});

test("question-scoped extraction does not silently answer a pool question with spa-only measurements", () => {
  const result = companyCamQuestionServiceInternals.extractAnswerFromQuestionText(
    "square_footage",
    "What was the pool square footage at Oleta Falls?",
    `
Swimming Pool Measurements
Spa Measurements
Square Footage (Surface Area)
147 sq ft
Estimated Average Depth (Inches)
30in
Estimated Approximate Gallons / Inch (Square Footage x .625)
91.2 Gallons/Inch
Estimated Approximate Total Gallons
2,736 Gallons
`
  );

  assert.match(result.displayValue, /No swimming pool square footage was present/i);
  assert.match(result.displayValue, /Spa Measurements shows 147 ft/i);
});

test("average depth extractor pulls inch values from report text", () => {
  const result = extractAverageDepthFromText(CAMP_MIKELL_EXCERPT);

  assert.equal(result.rawValue, "56");
  assert.equal(result.numericValue, 56);
  assert.equal(result.displayValue, "56 in");
});

test("gallons per inch extractor pulls decimal gallons-per-inch values from report text", () => {
  const result = extractGallonsPerInchFromText(`
Estimated Approximate Gallons / Inch (Square Footage x .625)
310.3 Gallons/Inch
Estimated Approximate Total Gallons
13,032.6 Gallons
`);

  assert.equal(result.rawValue, "310.3");
  assert.equal(result.numericValue, 310.3);
  assert.equal(result.displayValue, "310.3 Gallons/Inch");
});

test("measurement summary combines the supported measurement fields", () => {
  const result = extractMeasurementSummaryFromText(CAMP_MIKELL_EXCERPT);

  assert.match(result.displayValue, /Square Footage \(Surface Area\): 2,872 ft²/);
  assert.match(result.displayValue, /Estimated Average Depth \(Inches\): 56 in/);
  assert.match(result.displayValue, /Estimated Approximate Gallons \/ Inch \(Square Footage x \.625\): 1,795 Gallons\/Inch/);
  assert.match(result.displayValue, /Estimated Approximate Total Gallons: 101,000 Gallons/);
});

test("report findings extractor pulls the leak-detection findings section from checklist text", () => {
  const result = extractReportFindingsFromText(CAMP_MIKELL_FINDINGS_EXCERPT);

  assert.equal(result.fieldLabel, "Report findings");
  assert.match(result.displayValue, /1700 gallons daily water loss/i);
  assert.match(result.displayValue, /Skimmer 5/i);
});

test("project search queries preserve both sides of a Statehouse-style question", () => {
  const queries = buildProjectSearchQueries(
    "What are the total pool gallons in the report for Statehouse Arena in L3 Campus?"
  );

  assert.ok(queries.includes("Statehouse Arena"));
  assert.ok(queries.includes("L3 Campus"));
});

test("project search queries strip filler words from same-day American Lifestyle questions", () => {
  const queries = buildProjectSearchQueries(
    "What's the square footage of the American Lifestyle pool we did today?"
  );

  assert.ok(queries.includes("American Lifestyle"));
  assert.doesNotMatch(queries.join(" "), /\bwe did today\b/i);
});

test("project search queries keep Oleta Falls clean for measurement lookups", () => {
  const queries = buildProjectSearchQueries(
    "What was the pool square footage at Oleta Falls?"
  );

  assert.ok(queries.includes("Oleta Falls"));
  assert.doesNotMatch(queries.join(" "), /\bwas at\b/i);
});

test("project scoring keeps the exact Camp Mikell property tied or ahead of another Toccoa project", () => {
  const question = "What are the total pool gallons in the report for Camp Mikell in Toccoa GA?";
  const campScore = scoreProjectAgainstQuestion(CAMP_MIKELL_PROJECT, question);
  const otherScore = scoreProjectAgainstQuestion(OTHER_TOCCOA_PROJECT, question);

  assert.ok(
    campScore >= otherScore,
    `expected Camp Mikell score ${campScore} to stay tied or ahead of alternate project score ${otherScore}`
  );
});

test("formatted CompanyCam answer is readable for operator-facing proofs", () => {
  const output = formatCompanyCamReportAnswer({
    tenantId: "aquatrace",
    project: CAMP_MIKELL_PROJECT,
    answer: {
      fieldLabel: "Estimated Approximate Total Gallons",
      displayValue: "101,000 Gallons",
    },
    sourceDocument: {
      name: "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 06-05-2026.pdf",
    },
    source: {
      evidenceSnippet: "Estimated Approximate Total Gallons 101,000 Gallons",
    },
    alternativeProjects: [OTHER_TOCCOA_PROJECT],
  });

  assert.match(output, /COMPANYCAM JOB DATA/);
  assert.match(output, /101,000 Gallons/);
  assert.match(output, /Alex Mastej/);
  assert.match(output, /Brenda Bigley/);
  assert.match(output, /read-only/i);
});

test("resolver scans all project PDFs and does not stop at a newer non-checklist document", async () => {
  const fakeRail = {
    async searchProjects({ query }) {
      if (query === "Statehouse Arena") {
        return [];
      }

      if (query === "L3 Campus") {
        return [
          {
            id: "107515958",
            name: "L3 Campus",
            address: {
              street_address_1: "600 West Lafayette Street",
              city: "Tallahassee",
              state: "Florida",
              postal_code: "32304",
            },
          },
        ];
      }

      return [];
    },
    async listProjectDocuments(projectId) {
      assert.equal(projectId, "107515958");
      return [
        {
          id: "18142077",
          name: "L3 Campus - Statehouse Arena.pdf",
          content_type: "application/pdf",
          updated_at: 300,
          url: "mock://statehouse-summary",
        },
        {
          id: "18142076",
          name: "Swimming Pool Evaporation Calculator | Aquatrace Leak Detection.pdf",
          content_type: "application/pdf",
          updated_at: 299,
          url: "mock://evap",
        },
        {
          id: "18001710",
          name: "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 06-23-2026.pdf",
          content_type: "application/pdf",
          updated_at: 200,
          url: "mock://checklist",
        },
      ];
    },
  };

  const pdfTexts = {
    "mock://statehouse-summary": { text: "Statehouse Arena overview only", byteLength: 10 },
    "mock://evap": { text: "Evaporation calculator", byteLength: 10 },
    "mock://checklist": {
      text: `
Estimated Average Depth (Inches)
37"
Estimated Approximate Gallons / Inch (Square Footage x .625)
654 Gallons/ Inch
Estimated Approximate Total Gallons
24,250 Gallon
`,
      byteLength: 10,
    },
  };

  const result = await answerCompanyCamReportQuestion({
    companyCamRail: fakeRail,
    tenantId: "aquatrace",
    question: "What are the total pool gallons in the report for Statehouse Arena in L3 Campus?",
    extractPdfTextFromUrlImpl: async (url) => pdfTexts[url],
  });

  assert.equal(result.answer.numericValue, 24250);
  assert.equal(result.project.id, "107515958");
  assert.equal(result.sourceDocument.id, "18001710");
  assert.equal(result.resourcePath.provider, "companycam");
});

test("resolver can answer square footage using the latest American Lifestyle project match", async () => {
  const fakeRail = {
    async searchProjects({ query }) {
      if (query === "American Lifestyle") {
        return [
          {
            id: "108479333",
            name: "American Lifestyle Pools",
            address: {
              street_address_1: "5728 Grand Reunion Drive",
              city: "Hoschton",
              state: "Georgia",
              postal_code: "30548",
            },
            updated_at: 1783003131,
          },
        ];
      }

      return [];
    },
    async listProjectDocuments(projectId) {
      assert.equal(projectId, "108479333");
      return [
        {
          id: "19000001",
          name: "Exported - Current Aquatrace Swimming Pool Leak Detection Checklist 07-02-2026.pdf",
          content_type: "application/pdf",
          updated_at: 400,
          url: "mock://american-lifestyle",
        },
      ];
    },
  };

  const pdfTexts = {
    "mock://american-lifestyle": {
      text: `
Square Footage (Surface Area)
496.4ft²
Estimated Average Depth (Inches)
42in
Estimated Approximate Gallons / Inch (Square Footage x .625)
310.3 Gallons/Inch
Estimated Approximate Total Gallons
13,032.6 Gallons
`,
      byteLength: 10,
    },
  };

  const result = await answerCompanyCamReportQuestion({
    companyCamRail: fakeRail,
    tenantId: "aquatrace",
    question: "What's the square footage of the American Lifestyle pool we did today?",
    extractPdfTextFromUrlImpl: async (url) => pdfTexts[url],
  });

  assert.equal(result.answer.fieldLabel, "Square Footage (Surface Area)");
  assert.equal(result.answer.displayValue, "496.4 ft²");
  assert.equal(result.project.id, "108479333");
});
