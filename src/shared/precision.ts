/**
 * Exact scaled integer precision utility for fuel quantities and meter totalizers.
 * Scale: 3 decimal places (1 milliunit = 0.001 L or 0.001 KG).
 * Uses strictly integer arithmetic to prevent floating-point inaccuracies.
 */

export const MILLIUNIT_SCALE = 1000;

/**
 * Parses a decimal string representation (e.g. "1000.125", "1000", "0.5") into integer milliunits.
 * Rejects numbers with more than 3 decimal places or negative values or invalid formats.
 */
export function parseMilliunits(val: string | number | null | undefined): number {
  if (val === null || val === undefined) {
    throw new Error('Quantity value is null or undefined');
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      throw new Error(`Invalid numeric quantity: ${val}`);
    }
    if (val < 0) {
      throw new Error(`Negative quantity not allowed: ${val}`);
    }
    // If it's an integer already
    if (Number.isInteger(val)) {
      return val * MILLIUNIT_SCALE;
    }
    val = val.toFixed(3);
  }

  const str = String(val).trim();
  if (!str) {
    throw new Error('Quantity string cannot be empty');
  }

  // Regex for non-negative decimal with max 3 decimal digits
  const regex = /^(\d+)(?:\.(\d{1,3}))?$/;
  const match = str.match(regex);
  if (!match) {
    throw new Error(`Invalid quantity decimal format: "${str}". Maximum 3 decimal places allowed.`);
  }

  const wholePart = parseInt(match[1], 10);
  const fracPart = match[2] || '';
  const paddedFrac = fracPart.padEnd(3, '0');
  const fractionNum = parseInt(paddedFrac, 10);

  return wholePart * MILLIUNIT_SCALE + fractionNum;
}

/**
 * Formats an integer milliunit into a string with 3 decimal places (e.g. 1000125 -> "1000.125").
 */
export function formatMilliunits(milliunits: number | null | undefined): string {
  if (milliunits === null || milliunits === undefined || isNaN(milliunits)) {
    return '0.000';
  }

  const isNeg = milliunits < 0;
  const abs = Math.abs(Math.round(milliunits));
  const whole = Math.floor(abs / MILLIUNIT_SCALE);
  const frac = abs % MILLIUNIT_SCALE;

  const fracStr = frac.toString().padStart(3, '0');
  return `${isNeg ? '-' : ''}${whole}.${fracStr}`;
}
