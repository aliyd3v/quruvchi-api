const { z, number } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { TaskPriority } = require("../../../generated/prisma");

const dto = z
  .object(
    {
      description: z.string({ message: "description_is_required" }).min(1, { message: "description_min_length_is_1" }),
      quantityOfCompleted: z.number({ message: "quantity_of_completed_must_be_number" }).refine((value) => !Number.isNaN(value) && value >= 0, { message: "object_id_must_be_positive_integer" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.taskHistoryUpdateValidatorMiddleware = (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
