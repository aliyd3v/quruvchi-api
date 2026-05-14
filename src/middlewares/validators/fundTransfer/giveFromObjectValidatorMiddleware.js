const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      fromObjectId: z.number({ message: "from_object_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "from_object_id_must_be_positive_integer" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      note: z.string({ message: "note_is_required" }).min(1, { message: "note_min_length_is_1" }).optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.giveFromObjectValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
