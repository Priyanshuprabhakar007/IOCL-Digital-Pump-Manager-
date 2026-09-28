export function parseMoneyToPaise(amount: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error("INVALID_MONEY_FORMAT");
  return Math.round(parseFloat(amount) * 100);
}

export function formatPaiseToMoney(paise: number): string {
  return (paise / 100).toFixed(2);
}
