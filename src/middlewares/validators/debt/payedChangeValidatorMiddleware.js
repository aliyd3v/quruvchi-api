const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("@prisma/client");

const payedChangeDto = z
  .object(
    {
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      description: z.any().optional(),
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
          { invalid_type_error: "items_must_be_array" }
        )
        .optional(),
      itemsAppliedAmounts: z
        .array(
          z.object({
            amountApplied: z
              .number({ message: "price_per_unit_must_be_number" })
              .positive({ message: "price_per_unit_must_be_positive_number" })
              .transform((val) => BigInt(Math.round(val * 100))),
            itemId: z.number({ message: "product_id_must_be_number" }).positive({ message: "product_id_must_be_positive_number" }),
          }),
          { invalid_type_error: "items_must_be_array" }
        )
        .optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.payedChangeValidatorMiddleware = (req, _res, next) => {
  const parsed = payedChangeDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
