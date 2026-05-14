const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("../../../generated/prisma");

const dto = z
  .object(
    {
      pricePerUnit: z
        .number({ message: "price_per_unit_must_be_number" })
        .positive({ message: "price_per_unit_must_be_positive_number" })
        .transform((v) => BigInt(Math.round(v * 100))),
      sku: z.string({ message: "sku_must_be_string" }).trim().optional(),
      name: z.string({ message: "inventory_name_is_required" }).min(1, { message: "inventory_name_min_length_is_1" }),
      unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.inventoryUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
