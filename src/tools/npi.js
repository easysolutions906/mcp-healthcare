const FETCH_TIMEOUT_MS = 10000;
const NPI_REGEX = /^\d{10}$/;
const SAFE_TEXT_REGEX = /^[a-zA-Z0-9\s.\-']+$/;

// --- Pure formatting functions ---

const sanitizeParam = (val) => {
  if (!val || typeof val !== 'string') { return undefined; }
  return SAFE_TEXT_REGEX.test(val) ? val.trim() : undefined;
};

const buildNppesUrl = (params) => {
  const searchParams = new URLSearchParams({ version: '2.1' });
  Object.entries(params)
    .filter(([, val]) => val)
    .forEach(([key, val]) => searchParams.set(key, val));
  return `https://npiregistry.cms.hhs.gov/api/?${searchParams.toString()}`;
};

const formatAddress = (addr) => ({
  type: addr.address_purpose === 'LOCATION' ? 'practice' : 'mailing',
  line1: addr.address_1,
  line2: addr.address_2 || null,
  city: addr.city,
  state: addr.state,
  zip: addr.postal_code,
  country: addr.country_code,
  phone: addr.telephone_number,
  fax: addr.fax_number || null,
});

const formatTaxonomy = (tax) => ({
  code: tax.code,
  description: tax.desc,
  primary: tax.primary,
  state: tax.state,
  license: tax.license,
});

const formatIdentifier = (id) => ({
  code: id.code,
  description: id.desc,
  identifier: id.identifier,
  state: id.state,
  issuer: id.issuer,
});

const formatProvider = (result) => {
  const basic = result.basic || {};
  const isOrganization = result.enumeration_type === 'NPI-2';

  return {
    npi: result.number,
    type: isOrganization ? 'organization' : 'individual',
    ...(isOrganization
      ? {
        organizationName: basic.organization_name,
        authorizedOfficial: basic.authorized_official_first_name
          ? `${basic.authorized_official_first_name} ${basic.authorized_official_last_name}`
          : null,
      }
      : {
        firstName: basic.first_name,
        lastName: basic.last_name,
        middleName: basic.middle_name || null,
        credential: basic.credential || null,
        gender: basic.gender || null,
      }),
    status: basic.status || 'Active',
    enumerationDate: basic.enumeration_date,
    lastUpdated: basic.last_updated,
    addresses: (result.addresses || []).map(formatAddress),
    taxonomies: (result.taxonomies || []).map(formatTaxonomy),
    identifiers: (result.identifiers || []).map(formatIdentifier),
  };
};

// --- Side-effect boundary: network calls ---

const searchNppes = async (params) => {
  const url = buildNppesUrl(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MCP-Healthcare-Server/1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error('NPPES registry unavailable');
    }

    const data = await res.json();

    if (data.Errors) {
      return { count: 0, results: [] };
    }

    return {
      count: data.result_count || 0,
      results: (data.results || []).map(formatProvider),
    };
  } finally {
    clearTimeout(timeout);
  }
};

// --- Tool implementations ---

const search = async ({ first_name, last_name, organization_name, taxonomy_description, city, state, postal_code, limit }) => {
  const searchFields = { first_name, last_name, organization_name, taxonomy_description, city, state, postal_code };
  const sanitized = Object.entries(searchFields).reduce((acc, [key, val]) => {
    const clean = sanitizeParam(val);
    if (clean) { acc[key] = clean; }
    return acc;
  }, {});

  if (Object.keys(sanitized).length === 0) {
    return { error: 'At least one search parameter is required (first_name, last_name, organization_name, taxonomy_description, city, state, or postal_code)' };
  }

  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200);

  try {
    return await searchNppes({ ...sanitized, limit: String(clampedLimit) });
  } catch (err) {
    return { error: `NPI search failed: ${err.message}` };
  }
};

const lookup = async (number) => {
  if (!number || typeof number !== 'string') {
    return { error: 'NPI number is required' };
  }

  const trimmed = number.trim();

  if (!NPI_REGEX.test(trimmed)) {
    return { error: 'NPI must be a 10-digit number' };
  }

  try {
    const result = await searchNppes({ number: trimmed });
    if (result.count === 0) {
      return { error: 'NPI not found', npi: trimmed };
    }
    return result.results[0];
  } catch (err) {
    return { error: `NPI lookup failed: ${err.message}` };
  }
};

export { search, lookup };
