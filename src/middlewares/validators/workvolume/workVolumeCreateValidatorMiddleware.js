const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { Unit } = require("@prisma/client");

const dto = z
  .object(
    {
      title: z.string({ message: "title_must_be_string" }).nonempty({ message: "title_cannot_be_empty" }),
      description: z.string({ message: "description_must_be_string" }).optional(),
      object_id: z.number({ message: "object_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "object_id_must_be_positive_integer" }),
      unit: z.enum([Unit.DAY, Unit.H, Unit.KG, Unit.L, Unit.M, Unit.M2, Unit.M3, Unit.PCS, Unit.TON], { message: "unit_in_day_h_kg_l_m_m2_m3_pcs_ton" }).nonoptional({ message: "unit_is_required" }),
      unit_price: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      quantity: z.number({ message: "quantity_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "quantity_must_be_positive_integer" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.workVolumeCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
