const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const createTransferToSADto = z
  .object(
    {
      amount: z
        .number({ message: "amount_must_be_number" })
        .refine((value) => value && !Number.isNaN(value) && value > 0, { message: "amount_must_be_number" })
        .transform((val) => BigInt(Math.round(val * 100))),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.createTransferToSAValidatorMiddleware = (req, _res, next) => {
  const parsed = createTransferToSADto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
