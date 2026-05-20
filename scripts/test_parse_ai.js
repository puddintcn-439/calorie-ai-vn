const fs = require('fs');
const path = require('path');
const aiModule = require(path.resolve(__dirname, '../apps/backend/dist/apps/backend/src/modules/ai/ai.service.js'));
const AiService = aiModule.AiService;

const mockConfig = { get: (k) => undefined, getOrThrow: (k) => 'dummy' };
const mockMetrics = { recordAiScan: (ok) => {} };

const service = new AiService(mockConfig, mockMetrics);

const debugPath = path.resolve(__dirname, '../tmp/ai_debug_response.json');
if (!fs.existsSync(debugPath)) {
  console.error('No debug file at', debugPath);
  process.exit(2);
}
let rawContent = fs.readFileSync(debugPath, 'utf8');
// strip BOM if present
rawContent = rawContent.replace(/^\uFEFF/, '');
const debug = JSON.parse(rawContent);
const raw = debug.raw_ai_response || debug.raw_ai_response;
const parsed = service.parseAIResponse(raw, 999, { source: 'local-test' });
console.log(JSON.stringify(parsed, null, 2));
