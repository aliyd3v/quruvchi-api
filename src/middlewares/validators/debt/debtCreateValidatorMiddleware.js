const { z, bigint } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { DebtType, CounterPartyType, Unit } = require("@prisma/client");

const debtCreateDto = z
  .object(
    {
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      note: z.string({ message: "note_must_be_string" }).optional(),
      counterpartyName: z.string({ message: "counterparty_name_is_required" }).min(1, { message: "description_min_length_is_1" }).optional(),
      counterpartyPhone: z
        .string({ message: "phone_is_required" })
        .trim()
        .regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
      type: z.enum([DebtType.BORROWED, DebtType.LENT], { message: "type_in_borrowed_and_lend" }),
      dueAt: z.preprocess(
        (v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(new Date(v).toISOString().slice(0, -1) + "+05:00") : v) : v),
        z.date({ message: "due_at_must_be_date" }),
      ),
      issuedAt: z.preprocess(
        (v) => (typeof v === "string" ? (!Number.isNaN(Date.parse(v)) ? new Date(new Date(v).toISOString().slice(0, -1) + "+05:00") : v) : v),
        z.date({ message: "issued_at_must_be_date" }),
      ),
      smsBefore: z.preprocess((v) => (typeof v === "boolean" ? v : false), z.boolean()),
      smsLate: z.preprocess((v) => (typeof v === "boolean" ? v : false), z.boolean()),
      callBefore: z.preprocess((v) => (typeof v === "boolean" ? v : false), z.boolean()),
      callLate: z.preprocess((v) => (typeof v === "boolean" ? v : false), z.boolean()),
      counterPartyType: z.enum([CounterPartyType.COMPANY, CounterPartyType.INDIVIDUAL], { message: "debtor_or_creditor_type_invalid" }),
      organizationId: z.any().optional(),
      isDollar: z.preprocess((v) => (typeof v === "boolean" ? v : false), z.boolean()),
      items: z
        .array(
          z.object({
            name: z.string({ message: "product_name_must_be_string" }).nonempty({ message: "product_name_cannot_be_empty" }),
            parameter: z.string({ message: "parameter_must_be_string" }).nonempty({ message: "parameter_cannot_be_empty" }),
            quantity: z.number({ message: "quantity_must_be_number" }).positive({ message: "quantity_must_be_positive_number" }),
            pricePerUnit: z
              .number({ message: "price_per_unit_must_be_number" })
              .positive({ message: "price_per_unit_must_be_positive_number" })
              .transform((val) => BigInt(Math.round(val * 100))),
            recipient: z.string({ message: "recipient_must_be_string" }).optional(),
            unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
          }),
          { invalid_type_error: "items_must_be_array" },
        )
        .optional(),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.debtCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = debtCreateDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
