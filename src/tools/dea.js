// --- Registrant type lookup ---

const REGISTRANT_TYPES = {
  A: 'Dispenser (Hospitals, Pharmacies, Practitioners)',
  B: 'Dispenser (Hospitals, Pharmacies, Practitioners)',
  C: 'Manufacturer (Schedule I Researcher)',
  D: 'Manufacturer (Schedule I Researcher)',
  E: 'Manufacturer (Schedule I Researcher)',
  F: 'Manufacturer',
  G: 'Distributor',
  H: 'Distributor',
  J: 'Distributor',
  K: 'Distributor',
  L: 'Reverse Distributor',
  M: 'Mid-Level Practitioner',
  P: 'Narcotic Treatment Program',
  R: 'Narcotic Treatment Program',
  S: 'Narcotic Treatment Program',
  T: 'Narcotic Treatment Program',
  X: 'Suboxone/Subutex Prescriber',
};

const resolveRegistrantType = (letter) =>
  REGISTRANT_TYPES[letter.toUpperCase()] || 'Unknown';

// --- DEA checksum logic ---

const computeCheckDigit = (digits) => {
  const oddSum = [0, 2, 4].reduce((sum, i) => sum + digits[i], 0);
  const evenSum = [1, 3, 5].reduce((sum, i) => sum + digits[i], 0);
  const total = oddSum + evenSum * 2;
  return total % 10;
};

// --- Tool implementations ---

const validate = (raw) => {
  const errors = [];
  const dea = (raw || '').trim().toUpperCase();

  if (!dea) {
    return {
      valid: false,
      dea: raw || '',
      checkDigit: null,
      registrantType: null,
      errors: ['DEA number is required'],
    };
  }

  if (dea.length !== 9) {
    errors.push(`DEA number must be exactly 9 characters, got ${dea.length}`);
  }

  const letterPart = dea.slice(0, 2);
  const digitPart = dea.slice(2);

  if (!/^[A-Z]{2}$/.test(letterPart)) {
    errors.push('First two characters must be letters');
  }

  if (!/^\d{7}$/.test(digitPart)) {
    errors.push('Last seven characters must be digits');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      dea,
      checkDigit: null,
      registrantType: letterPart.length >= 1 ? resolveRegistrantType(letterPart[0]) : null,
      errors,
    };
  }

  const digits = digitPart.split('').map(Number);
  const expectedCheck = computeCheckDigit(digits.slice(0, 6));
  const actualCheck = digits[6];

  if (expectedCheck !== actualCheck) {
    errors.push(`Check digit mismatch: expected ${expectedCheck}, got ${actualCheck}`);
  }

  return {
    valid: errors.length === 0,
    dea,
    checkDigit: actualCheck,
    registrantType: resolveRegistrantType(letterPart[0]),
    errors,
  };
};

const generateTest = (lastName) => {
  if (!lastName || typeof lastName !== 'string') {
    return { error: 'lastName parameter is required' };
  }

  const sanitized = lastName.trim().replace(/[^\w]/g, '').slice(0, 20);
  const initial = sanitized ? sanitized[0] : null;

  if (!initial || !/^[A-Z]$/i.test(initial)) {
    return { error: 'lastName must start with a letter (A-Z)' };
  }

  const prefix = 'A';
  const second = initial.toUpperCase();
  const randomDigits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10));
  const checkDigit = computeCheckDigit(randomDigits);
  const number = `${prefix}${second}${randomDigits.join('')}${checkDigit}`;

  return {
    dea: number,
    disclaimer: 'This is a randomly generated test DEA number for development and testing purposes only. It is not a real DEA registration.',
    registrantType: resolveRegistrantType(prefix),
  };
};

export { validate, generateTest };
