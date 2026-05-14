const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const fundCreateForSADto = z
  .object(
    {
      initial_amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(val)),

      object_id: z
        .number({ message: "object_id_must_be_number" })
        .refine((value) => !Number.isNaN(value) && value > 0, { message: "object_id_must_be_positive_integer" })
        .optional(),

      description: z.string({ message: "description_is_required" }).min(1, { message: "description_min_length_is_1" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.fundCreateForSAValidatorMiddleware = (req, _res, next) => {
  const parsed = fundCreateForSADto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
