const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("@prisma/client");

const dto = z
  .object(
    {
      inventoryId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      name: z.string({ message: "product_name_must_be_string" }).trim().nonempty({ message: "product_name_cannot_be_empty" }),
      quantity: z.number({ message: "quantity_must_be_number" }).positive({ message: "quantity_must_be_greater_than_0" }),
      parameter: z.string({ message: "parameter_must_be_string" }).trim().nonempty({ message: "parameter_cannot_be_empty" }),
      pricePerUnit: z
        .number()
        .positive({ message: "price_per_unit_must_be_greater_than_0" })
        .transform((v) => BigInt(Math.round(v * 100))),
      unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.transactionItemCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
