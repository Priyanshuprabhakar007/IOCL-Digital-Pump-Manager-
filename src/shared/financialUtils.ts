export function parseMoneyToPaise(amount: string): number {
  if (typeof amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("INVALID_MONEY_FORMAT");
  }
  const [whole, fraction = "00"] = amount.split(".");
  const paddedFraction = fraction.padEnd(2, "0").slice(0, 2);
  if (fraction.length > 2) throw new Error("INVALID_MONEY_FORMAT");
  return parseInt(whole, 10) * 100 + parseInt(paddedFraction, 10);
}

export function formatPaiseToMoney(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error("INVALID_PAISE_VALUE");
  const whole = Math.floor(paise / 100);
  const fraction = Math.abs(paise % 100);
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}
