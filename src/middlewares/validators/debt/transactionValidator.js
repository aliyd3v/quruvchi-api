const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { DebtTransactionType } = require("@prisma/client");

const txnDto = z
  .object(
    {
      type: z.enum(Object.values(DebtTransactionType), { message: "invalid_type" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      description: z.string({ message: "description_must_be_string" }).optional(),
    },
    { message: "body_is_required" }
  )
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

const transactionCreateValidator = (req, _res, next) => {
  const parsed = txnDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};

const transactionUpdateValidator = (req, _res, next) => {
  const parsed = txnDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};

module.exports = { transactionCreateValidator, transactionUpdateValidator };
