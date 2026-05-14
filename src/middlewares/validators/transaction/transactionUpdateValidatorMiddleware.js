const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const transactionUpdateDto = z
  .object(
    {
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      date: z.preprocess(
        (val) => {
          if (val === undefined || val === null || val === "") return undefined;
          if (typeof val === "string") return new Date(val);
          return val;
        },
        z.union([z.date({ invalid_type_error: "date_must_be_date" }), z.undefined().refine(() => false, { message: "date_required" })]),
      ),
      purpose: z.string({ message: "purpose_must_be_string" }).nonempty({ message: "purpose_cannot_be_empty" }),
      notes: z.string({ message: "notes_must_be_string" }).optional(),
      object_id: z
        .number({ message: "organization_id_must_be_number" })
        .refine((value) => !Number.isNaN(Number(value)), { message: "organization_id_must_be_positive_integer" })
        .optional(),
      organization_id: z
        .number({ message: "organization_id_must_be_number" })
        .refine((value) => !Number.isNaN(Number(value)), { message: "organization_id_must_be_positive_integer" })
        .optional(),
      organization_balance: z.any().optional(),
      branchId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      executedById: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.transactionUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = transactionUpdateDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
