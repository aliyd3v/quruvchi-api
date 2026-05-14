const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      description: z.string({ message: "description_must_be_string" }).trim().optional(),
      quantity: z.number({ message: "quantity_must_be_number" }).positive({ message: "quantity_must_be_number" }),
      organizationId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      objectId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      executedById: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      branchId: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null), z.union([z.number(), z.null()])),
      pricePerUnit: z.preprocess((v) => (!Number.isNaN(Number(v)) && Number(v) > 0 ? BigInt(Math.floor(Number(v) * 100)) : null), z.bigint()),
    },
    { message: "body_is_required" },
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.inventoryHistoryUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
