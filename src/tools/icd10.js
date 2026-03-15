import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 100;

// ICD-10-CM chapter ranges
const CHAPTERS = {
  1:  { range: ['A00', 'B99'], title: 'Certain infectious and parasitic diseases' },
  2:  { range: ['C00', 'D49'], title: 'Neoplasms' },
  3:  { range: ['D50', 'D89'], title: 'Diseases of the blood and blood-forming organs' },
  4:  { range: ['E00', 'E89'], title: 'Endocrine, nutritional and metabolic diseases' },
  5:  { range: ['F01', 'F99'], title: 'Mental, behavioral and neurodevelopmental disorders' },
  6:  { range: ['G00', 'G99'], title: 'Diseases of the nervous system' },
  7:  { range: ['H00', 'H59'], title: 'Diseases of the eye and adnexa' },
  8:  { range: ['H60', 'H95'], title: 'Diseases of the ear and mastoid process' },
  9:  { range: ['I00', 'I99'], title: 'Diseases of the circulatory system' },
  10: { range: ['J00', 'J99'], title: 'Diseases of the respiratory system' },
  11: { range: ['K00', 'K95'], title: 'Diseases of the digestive system' },
  12: { range: ['L00', 'L99'], title: 'Diseases of the skin and subcutaneous tissue' },
  13: { range: ['M00', 'M99'], title: 'Diseases of the musculoskeletal system and connective tissue' },
  14: { range: ['N00', 'N99'], title: 'Diseases of the genitourinary system' },
  15: { range: ['O00', 'O9A'], title: 'Pregnancy, childbirth and the puerperium' },
  16: { range: ['P00', 'P96'], title: 'Certain conditions originating in the perinatal period' },
  17: { range: ['Q00', 'Q99'], title: 'Congenital malformations, deformations and chromosomal abnormalities' },
  18: { range: ['R00', 'R99'], title: 'Symptoms, signs and abnormal clinical and laboratory findings' },
  19: { range: ['S00', 'T88'], title: 'Injury, poisoning and certain other consequences of external causes' },
  20: { range: ['V00', 'Y99'], title: 'External causes of morbidity' },
  21: { range: ['Z00', 'Z99'], title: 'Factors influencing health status and contact with health services' },
  22: { range: ['U00', 'U85'], title: 'Codes for special purposes' },
};

// --- Pure functions ---

const normalizeCode = (code) => code.replace(/[.\s-]/g, '').toUpperCase();

const formatCode = (raw) => {
  const clean = normalizeCode(raw);
  if (clean.length <= 3) {
    return clean;
  }
  return `${clean.slice(0, 3)}.${clean.slice(3)}`;
};

const getChapterForCode = (code) => {
  const prefix = code.slice(0, 3).toUpperCase();
  const entry = Object.entries(CHAPTERS).find(([, ch]) => {
    const [start, end] = ch.range;
    return prefix >= start && prefix <= end;
  });
  return entry ? { number: parseInt(entry[0], 10), ...entry[1] } : null;
};

const scoreMatch = (description, terms) => {
  const lower = description.toLowerCase();
  const matchCount = terms.filter((t) => lower.includes(t)).length;
  const exactStart = terms.some((t) => lower.startsWith(t)) ? 2 : 0;
  return matchCount + exactStart;
};

// --- Data loading ---

const loadData = () => {
  const dataPath = join(DATA_DIR, 'icd10.json');
  if (!existsSync(dataPath)) {
    throw new Error(`ICD-10 data file not found at ${dataPath}. Run "npm run link-data" first.`);
  }

  const raw = readFileSync(dataPath, 'utf-8');
  const codes = JSON.parse(raw);

  const codeMap = new Map();
  codes.forEach((entry) => {
    const normalized = entry.code.replace(/\./g, '').toUpperCase();
    codeMap.set(normalized, entry);
  });

  return { codes, codeMap };
};

const { codes: allCodes, codeMap } = loadData();

// --- Tool implementations ---

const lookup = (code) => {
  if (!code || typeof code !== 'string') {
    return { error: 'Missing required parameter: code' };
  }

  const normalized = normalizeCode(code.trim().slice(0, 200));
  const entry = codeMap.get(normalized);

  if (!entry) {
    return {
      error: 'Code not found',
      code: formatCode(code),
      suggestion: 'Use icd10_search to find codes by description keyword',
    };
  }

  const chapter = getChapterForCode(entry.code);
  return {
    code: entry.code,
    description: entry.description,
    formatted: formatCode(entry.code),
    chapter: chapter ? { number: chapter.number, title: chapter.title } : null,
  };
};

const search = (query, limit) => {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return { error: 'Query must be at least 2 characters' };
  }

  const sanitized = query.trim().slice(0, 200);
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const terms = sanitized.toLowerCase().split(/\s+/).filter(Boolean);

  const results = allCodes
    .map((entry) => {
      const score = scoreMatch(entry.description, terms);
      return score > 0 ? { ...entry, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, clampedLimit)
    .map(({ score, ...entry }) => entry);

  return {
    query: sanitized,
    count: results.length,
    results,
  };
};

const validate = (code) => {
  if (!code || typeof code !== 'string') {
    return { error: 'Missing required parameter: code' };
  }

  const sanitized = code.trim().slice(0, 200);
  const normalized = normalizeCode(sanitized);
  const entry = codeMap.get(normalized);
  const formatted = formatCode(sanitized);

  if (!entry) {
    return {
      code: formatted,
      valid: false,
      message: 'Code not found in ICD-10-CM 2025',
    };
  }

  const chapter = getChapterForCode(entry.code);
  return {
    code: entry.code,
    valid: true,
    description: entry.description,
    formatted: entry.code,
    chapter: chapter ? { number: chapter.number, title: chapter.title } : null,
  };
};

const totalCodes = allCodes.length;

export { lookup, search, validate, totalCodes };
