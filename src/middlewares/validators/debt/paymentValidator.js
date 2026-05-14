const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const paymentDto = z
  .object(
    {
      itemId: z.number({ message: "item_id_must_be_number" }).positive({ message: "invalid_item_id" }),
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
      description: z.string({ message: "description_must_be_string" }).optional(),
    },
    { message: "body_is_required" }
  )
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

const paymentCreateValidator = (req, _res, next) => {
  const parsed = paymentDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};

const paymentUpdateValidator = (req, _res, next) => {
  const parsed = paymentDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};

module.exports = { paymentCreateValidator, paymentUpdateValidator };
