const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      toOrganizationId: z
        .number({ message: "recipient_organization_id_must_be_number" })
        .refine((value) => !Number.isNaN(value) && value > 0, { message: "recipient_organization_id_must_be_positive_integer" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      contractNumber: z.string({ message: "contract_number_must_be_string" }).refine((value) => value !== "", { message: "contract_number_cannot_be_empty" }),
      note: z.string({ message: "note_is_required" }).min(1, { message: "note_min_length_is_1" }).optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.createUserToOrganizationValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
