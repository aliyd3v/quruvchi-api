const { Unit } = require("@prisma/client");
const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const itemDto = z
  .object(
    {
      name: z.string({ message: "product_name_must_be_string" }).nonempty({ message: "product_name_cannot_be_empty" }),
      parameter: z.string({ message: "parameter_must_be_string" }).nonempty({ message: "parameter_cannot_be_empty" }),
      quantity: z.number({ message: "quantity_must_be_number" }).positive({ message: "quantity_must_be_positive_number" }),
      pricePerUnit: z
        .number({ message: "price_per_unit_must_be_number" })
        .positive({ message: "price_per_unit_must_be_positive_number" })
        .transform((val) => BigInt(Math.floor(val * 100))),
      recipient: z.string({ message: "recipient_must_be_string" }).optional(),
      unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
    },
    { message: "body_is_required" }
  )
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

const itemCreateValidator = (req, _res, next) => {
  const parsed = itemDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};

const itemUpdateValidator = (req, _res, next) => {
  const parsed = itemDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};

module.exports = { itemCreateValidator, itemUpdateValidator };
