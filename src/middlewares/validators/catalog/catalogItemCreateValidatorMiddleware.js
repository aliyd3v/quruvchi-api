const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("@prisma/client");

const dto = z
  .object({
    name: z.string({ message: "product_name_must_be_string" }).nonempty({ message: "product_name_cannot_be_empty" }),
    quantity: z.preprocess(
      (v) => {
        if (v === "" || v === null || v === undefined) return v;
        const num = Number(String(v).replace(",", "."));
        return Number.isNaN(num) ? v : num;
      },
      z.number({ message: "quantity_must_be_number" }).positive({ message: "invalid_quantity" }),
    ),
    parameter: z.string({ message: "parameter_must_be_string" }).optional(),
    pricePerUnit: z.preprocess(
      // (v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.round(Number(v) * 100)) : v), z.bigint({ message: "invalid_price_per_unit" })
      (v) => {
        const value = !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? BigInt(Math.round(v * 100)) : null;
        if (value !== null && value > 999999999999999999n) return null;
        return value;
      },
      z.union([z.bigint({ message: "price_per_unit_must_be_number_and_not_so_big" })]),
    ),
    unit: z.enum(Object.values(Unit), { message: "invalid_unit" }),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

exports.catalogCreateItemValidatorMiddleware = async (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
