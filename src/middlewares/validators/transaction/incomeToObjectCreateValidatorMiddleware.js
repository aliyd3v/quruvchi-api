const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      object_id: z.number({ message: "invalid_object_id" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "invalid_object_id" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.floor(val * 100))),
      date: z.preprocess((v) => {
        if (v === undefined || v === null || v === "") return undefined;
        if (typeof v === "string") return new Date(v);
        return v;
      }, z.union([z.date({ invalid_type_error: "date_must_be_date" }), z.undefined().refine(() => false, { message: "date_required" })])),
      purpose: z.string({ message: "purpose_must_be_string" }).nonempty({ message: "purpose_cannot_be_empty" }),
      notes: z.string({ message: "notes_must_be_string" }).optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.incomeToObjectCreateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  req.body = parsed.data;
  next();
};
