export function parseMoneyToPaise(amount: string): number {
  if (typeof amount !== "string" || amount === "" || !/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("INVALID_MONEY_FORMAT");
  }
  const [wholePart, fractionPart = "00"] = amount.split(".");
  const paddedFraction = fractionPart.padEnd(2, "0").slice(0, 2);
  
  const paise = BigInt(wholePart) * 100n + BigInt(paddedFraction);
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("OVERFLOW_MAX_SAFE_INTEGER");
  
  return Number(paise);
}

export function parseSignedMoneyToPaise(amount: string): number {
  if (typeof amount !== "string" || amount === "" || !/^-?\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("INVALID_MONEY_FORMAT");
  }
  const isNegative = amount.startsWith("-");
  const absoluteAmount = isNegative ? amount.slice(1) : amount;
  
  const [wholePart, fractionPart = "00"] = absoluteAmount.split(".");
  const paddedFraction = fractionPart.padEnd(2, "0").slice(0, 2);
  
  const paise = BigInt(wholePart) * 100n + BigInt(paddedFraction);
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("OVERFLOW_MAX_SAFE_INTEGER");
  
  const result = Number(paise);
  return isNegative ? -result : result;
}

export function formatPaiseToMoney(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error("INVALID_PAISE_VALUE");
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  
  const paiseStr = absPaise.toString().padStart(3, "0");
  const whole = paiseStr.slice(0, -2);
  const fraction = paiseStr.slice(-2);
  
  const formatted = `${whole}.${fraction}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function calculateRevenuePaise(quantityMilliunits: number, pricePaisePerUnit: number): number {
  if (quantityMilliunits < 0 || pricePaisePerUnit < 0) throw new Error("INVALID_INPUT_VALUES");
  
  const numerator = BigInt(quantityMilliunits) * BigInt(pricePaisePerUnit);
  const quotient = numerator / 1000n;
  const remainder = numerator % 1000n;
  
  let revenuePaise = quotient;
  if (remainder >= 500n) {
    revenuePaise += 1n;
  }
  
  if (revenuePaise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("FINANCIAL_AMOUNT_OVERFLOW");
  
  return Number(revenuePaise);
}
