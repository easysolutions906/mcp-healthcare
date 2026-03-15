import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const MAX_RESULTS = 100;
const NDC_REGEX = /^[\d-]+$/;

// --- Data loading ---

const loadData = () => {
  const dataPath = join(DATA_DIR, 'ndc.json');
  if (!existsSync(dataPath)) {
    throw new Error(`NDC data file not found at ${dataPath}. Run "npm run link-data" first.`);
  }

  const raw = readFileSync(dataPath, 'utf-8');
  const products = JSON.parse(raw);

  const ndcMap = new Map();
  products.forEach((p) => {
    ndcMap.set(p.ndcNormalized, p);
    ndcMap.set(p.ndc, p);
  });

  return { products, ndcMap };
};

const { products, ndcMap } = loadData();

// --- Pure functions ---

const normalize = (ndc) => ndc.replace(/[-\s]/g, '');

const formatProduct = ({ ndcNormalized, ...rest }) => rest;

const searchProducts = (query, limit) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) { return []; }

  const scored = products.reduce((acc, p) => {
    const searchable = `${p.name} ${p.genericName} ${p.ingredients} ${p.manufacturer}`.toLowerCase();
    let score = 0;

    terms.forEach((term) => {
      if (searchable.includes(term)) { score += 1; }
    });

    if (score > 0) {
      const nameMatch = p.name.toLowerCase().startsWith(terms[0]) || p.genericName.toLowerCase().startsWith(terms[0]);
      if (nameMatch) { score += 2; }
      acc.push({ product: p, score });
    }

    return acc;
  }, []);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => formatProduct(s.product));
};

// --- Tool implementations ---

const lookup = (ndc) => {
  if (!ndc || typeof ndc !== 'string') {
    return { error: 'Missing required parameter: ndc' };
  }

  const trimmed = ndc.trim();

  if (!NDC_REGEX.test(trimmed)) {
    return { error: 'Invalid NDC format. Expected digits and dashes only (e.g., 0002-1433-80).' };
  }

  const normalized = normalize(trimmed);
  const product = ndcMap.get(normalized) || ndcMap.get(trimmed);

  if (!product) {
    return { error: 'NDC not found', ndc: trimmed };
  }

  return formatProduct(product);
};

const search = (query, limit) => {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return { error: 'Query must be at least 2 characters' };
  }

  const sanitized = query.trim().slice(0, 200);
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), MAX_RESULTS);
  const results = searchProducts(sanitized, clampedLimit);

  return {
    query: sanitized,
    count: results.length,
    results,
  };
};

const searchIngredient = (ingredient, limit) => {
  if (!ingredient || typeof ingredient !== 'string' || ingredient.trim().length < 2) {
    return { error: 'Ingredient must be at least 2 characters' };
  }

  const sanitized = ingredient.trim().slice(0, 200);
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), MAX_RESULTS);
  const term = sanitized.toLowerCase();

  const results = products
    .filter((p) => p.ingredients.toLowerCase().includes(term))
    .slice(0, clampedLimit)
    .map(formatProduct);

  return {
    ingredient: sanitized,
    count: results.length,
    results,
  };
};

const totalProducts = products.length;

export { lookup, search, searchIngredient, totalProducts };
