const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const productNameUpdateDto = z
  .object(
    {
      name: z.string({ message: "product_name_is_required" }).min(1, { message: "product_name_min_length_is_1" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.productNameUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = productNameUpdateDto.safeDecode(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
