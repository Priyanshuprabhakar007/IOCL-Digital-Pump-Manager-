import { z } from "zod";
import { parseMoneyToPaise } from "../shared/financialUtils";

export const moneyStringSchema = z.string().refine((val) => {
  try {
    parseMoneyToPaise(val);
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid decimal money format (at most 2 decimal places)" });

export const ProductPriceSchema = z.object({
  productId: z.string(),
  pricePaisePerUnit: moneyStringSchema,
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
});

export const CreditPartySchema = z.object({
  partyCode: z.string().trim().min(1),
  partyName: z.string().trim().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const ShiftCollectionSchema = z.object({
  collectionType: z.enum(["CASH", "POS_CARD", "UPI", "FLEET_CARD", "CREDIT_SALE", "DIRECT_BANK_DROP"]),
  amountPaise: moneyStringSchema,
  provider: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  creditPartyId: z.string().optional().nullable(),
  collectedAt: z.string(),
  notes: z.string().optional().nullable(),
});

export const CashHandoverSchema = z.object({
  amountPaise: moneyStringSchema,
  handedOverAt: z.string(),
  notes: z.string().optional().nullable(),
});

export const BankDepositSchema = z.object({
  depositChannel: z.enum(["BANK_BRANCH", "CASH_DROP_BOX"]),
  amountPaise: moneyStringSchema,
  depositDate: z.string(),
  referenceNumber: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
});
