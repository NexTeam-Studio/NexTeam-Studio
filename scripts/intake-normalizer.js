#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readInput(filePath) {
  if (!filePath) fail('Usage: node scripts/intake-normalizer.js <input.md> <output.md>');
  if (!fs.existsSync(filePath)) fail(`Input file not found: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8').trim();
}

function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function detectRequestType(text) {
  const lower = text.toLowerCase();
  const scores = {
    bug: 0,
    feature: 0,
    'workflow change': 0,
    'documentation need': 0,
    'agent request': 0,
  };

  const keywordMap = {
    bug: ['bug', 'broken', 'error', 'issue', 'fix', 'fails', 'problem'],
    feature: ['feature', 'add', 'build', 'support', 'new capability', 'enhancement'],
    'workflow change': ['workflow', 'process', 'handoff', 'approval', 'planning', 'intake'],
    'documentation need': ['document', 'docs', 'documentation', 'write-up', 'guide'],
    'agent request': ['agent', 'meta-agent', 'planner agent', 'intake agent', 'qa agent'],
  };

  for (const [type, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) scores[type] += 1;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : 'workflow change';
}

function guessName(text, requestType) {
  const lower = text.toLowerCase();

  if (lower.includes('intake')) return 'Intake workflow refinement';
  if (lower.includes('planner')) return 'Planner workflow refinement';
  if (lower.includes('documentation')) return 'Documentation workflow refinement';
  if (lower.includes('agent')) return 'Agent request refinement';
  if (requestType === 'bug') return 'Bug intake refinement';
  if (requestType === 'feature') return 'Feature intake refinement';
  if (requestType === 'documentation need') return 'Documentation intake refinement';
  return 'Workflow intake refinement';
}

function guessDomain(text, requestType) {
  const lower = text.toLowerCase();

  if (lower.includes('agent') || lower.includes('workflow') || lower.includes('planning')) {
    return 'system / intake / workflow preparation';
  }
  if (requestType === 'documentation need') return 'system / documentation / knowledge maintenance';
  if (requestType === 'bug') return '[Needs clarification]';
  if (requestType === 'feature') return '[Needs clarification]';
  return 'system / intake / workflow preparation';
}

function collectAmbiguities(text, requestType) {
  const flags = [];
  const lower = text.toLowerCase();

  if (!lower.includes('agent') && !lower.includes('workflow') && !lower.includes('feature') && !lower.includes('bug')) {
    flags.push('Primary request type may need confirmation.');
  }
  if (!lower.includes('human approval') && !lower.includes('approval')) {
    flags.push('Approval expectations are not stated explicitly.');
  }
  if (!lower.includes('input') && !lower.includes('note') && !lower.includes('request')) {
    flags.push('Expected input shape may need clarification.');
  }
  if (!lower.includes('output') && !lower.includes('draft') && !lower.includes('summary')) {
    flags.push('Expected output format may need clarification.');
  }
  if (requestType === 'feature' && !lower.includes('where') && !lower.includes('repo') && !lower.includes('app')) {
    flags.push('Affected repo area is not identified.');
  }
  if (flags.length === 0) {
    flags.push('No critical ambiguity detected, but human review is still required.');
  }
  return flags;
}

function bulletList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function buildDraft(text) {
  const requestType = detectRequestType(text);
  const lower = text.toLowerCase();
  const ambiguities = collectAmbiguities(text, requestType);
  const name = guessName(text, requestType);
  const domain = guessDomain(text, requestType);

  const mission = lower.includes('turn') && lower.includes('draft')
    ? 'Create a repeatable workflow that converts rough human notes into a structured request draft for human review before planning or implementation begins.'
    : '[Needs clarification]';

  const mainTasks = [
    `classify the rough note as ${requestType}`,
    'convert the rough note into a structured request draft',
    'flag ambiguity or missing details clearly',
    'stop for human review before planning or implementation',
  ];

  const inputs = [
    'rough human note',
    lower.includes('context') ? 'source context' : '[Needs clarification]',
    'optional request type if already known',
  ];

  const outputs = [
    'structured request draft',
    'ambiguity flags',
    'plain-English summary',
  ];

  const allowedTools = [
    'docs/AGENT_REQUEST_TEMPLATE.md',
    'docs/AGENT_INTAKE.md',
    'docs/PHASE2_IMPLEMENTATION_PLAN.md',
    'human review',
  ];

  const restrictedActions = [
    'do not approve the request automatically',
    'do not invent missing facts',
    'do not trigger implementation directly',
    'do not bypass human review',
  ];

  const approvalTriggers = [
    'request will move into planning',
    'request changes workflow rules',
    'request is high-impact but unclear',
  ];

  const stopConditions = [
    'note is too vague to structure responsibly',
    'required context is missing',
    'human operator says stop',
  ];

  const successCriteria = [
    'messy input becomes a clear structured request draft',
    'ambiguity is visible',
    'the draft is ready for human approval without rereading the original note',
  ];

  const notes = [
    'keep the workflow narrow',
    'keep the workflow documentation-first',
    'do not treat this as a live autonomous agent runtime',
  ];

  return normalizeWhitespace(
`# STRUCTURED_REQUEST_DRAFT.md
> Generated by scripts/intake-normalizer.js from a rough note. Human approval is still required.

## Request Type
${requestType}

## 1. Requested Agent Name
${name}

## 2. Requested Domain
${domain}

## 3. Mission
${mission}

## 4. Main Tasks
${bulletList(mainTasks)}

## 5. Inputs
${bulletList(inputs)}

## 6. Outputs
${bulletList(outputs)}

## 7. Allowed Tools
${bulletList(allowedTools)}

## 8. Restricted Actions
${bulletList(restrictedActions)}

## 9. Approval Required
yes

## 10. Approval Triggers
${bulletList(approvalTriggers)}

## 11. Stop Conditions
${bulletList(stopConditions)}

## 12. Success Criteria
${bulletList(successCriteria)}

## 13. Notes / Constraints
${bulletList(notes)}

## Ambiguity Flags
${bulletList(ambiguities)}

## Source Summary
${text}
`);
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    fail('Usage: node scripts/intake-normalizer.js <input.md> <output.md>');
  }

  const input = readInput(inputPath);
  const output = buildDraft(input);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output}\n`, 'utf8');
  console.log(`Wrote structured request draft to ${outputPath}`);
}

main();
