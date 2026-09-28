export function parseMoneyToPaise(amount: string): number {
  if (typeof amount !== "string" || !/^-?\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("INVALID_MONEY_FORMAT");
  }
  const isNegative = amount.startsWith("-");
  const absoluteAmount = isNegative ? amount.slice(1) : amount;
  const [whole, fraction = "00"] = absoluteAmount.split(".");
  const paddedFraction = fraction.padEnd(2, "0").slice(0, 2);
  if (fraction.length > 2) throw new Error("INVALID_MONEY_FORMAT");
  
  const paise = parseInt(whole, 10) * 100 + parseInt(paddedFraction, 10);
  if (paise > Number.MAX_SAFE_INTEGER) throw new Error("OVERFLOW_MAX_SAFE_INTEGER");
  
  return isNegative ? -paise : paise;
}

export function formatPaiseToMoney(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error("INVALID_PAISE_VALUE");
  const isNegative = paise < 0;
  const absolutePaise = Math.abs(paise);
  const whole = Math.floor(absolutePaise / 100);
  const fraction = absolutePaise % 100;
  const formatted = `${whole}.${fraction.toString().padStart(2, "0")}`;
  return isNegative ? `-${formatted}` : formatted;
}
