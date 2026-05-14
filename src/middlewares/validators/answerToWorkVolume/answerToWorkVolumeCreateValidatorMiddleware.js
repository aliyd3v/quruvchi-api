const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const answerToWorkVolumeCreateDto = z
  .object(
    {
      unitPrice: z
        .number({ message: "unit_price_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "unit_price_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),

      notes: z.string({ message: "note_must_be_string" }).optional(),

      workVolumeId: z.number({ message: "work_volume_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "work_volume_id_must_be_positive_integer" }),

      quantity: z.number({ message: "quantity_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "quantity_must_be_positive_integer" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.answerToWorkVolumeCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = answerToWorkVolumeCreateDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
