const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { EntryColor, InvoiceStatus, EntryType } = require("../../../generated/prisma");

const dto = z.object({
  amount: z
    .number({ message: "amount_must_be_number" })
    .finite({ message: "amount_must_be_a_valid_number" })
    .positive({ message: "amount_must_be_greater_than_0" })
    .transform((val) => BigInt(Math.round(val * 100))),
  contractAmount: z
    .number({ message: "contract_amount_must_be_number" })
    .finite({ message: "contract_amount_must_be_a_valid_number" })
    .positive({ message: "contract_amount_must_be_greater_than_0" })
    .optional()
    .transform((v) => (v ? BigInt(Math.round(v * 100)) : null)),
  date: z.coerce.date({ errorMap: () => ({ message: "date_must_be_valid_date" }) }),
  contractDate: z.any().transform((v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null)),
  purpose: z.string({ message: "purpose_must_be_string" }).trim().min(1, { message: "purpose_cannot_be_empty" }),
  organizationId: z
    .number({ message: "organization_id_must_be_number" })
    .int({ message: "organization_id_must_be_integer" })
    .positive({ message: "organization_id_must_be_greater_than_0" })
    .optional()
    .transform((v) => v ?? null),
  description: z
    .string({ message: "description_must_be_string" })
    .trim()
    .optional()
    .transform((v) => v || null),
  contractNumber: z
    .string({ message: "contract_number_must_be_string" })
    .trim()
    .optional()
    .transform((v) => v || null),
  innStir: z
    .string({ message: "inn_stir_must_be_string" })
    .trim()
    .optional()
    .transform((v) => v || null),
  lot: z
    .string({ message: "lot_must_be_string" })
    .trim()
    .optional()
    .transform((v) => v || null),
  poaNumber: z
    .string({ message: "poa_number_must_be_string" })
    .trim()
    .optional()
    .transform((v) => v || null),
  type: z.enum(Object.values(EntryType), { message: "wrong_type" }),
  color: z.enum(Object.values(EntryColor), { message: "wrong_value_color" }),
  invoiceStatus: z.enum([InvoiceStatus.CLOSED, InvoiceStatus.NOT_CLOSED, InvoiceStatus.NO_INVOICE], { message: "wrong_value_invoice_status" }),
  isCardPayout: z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (val === "true") return true;
    if (val === "false") return false;
    return false;
  }, z.boolean()),
  ownerPhone: z.preprocess(
    (val) => (typeof val === "string" ? val.replace(/\s+/g, "") : val),
    z.string({ message: "phone_is_required" }).regex(/^(20|33|50|62|71|72|73|74|75|76|77|79|61|65|66|67|69|87|88|90|91|93|94|95|97|98|99)[0-9]{7}$/, { message: "phone_format_is_wrong" }),
  ),
});

exports.entryUpdateValidatorMiddleware = async (req, _res, next) => {
  if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
    return next(new AppError(400, "validation_error", { message: "body_is_required" }));
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
