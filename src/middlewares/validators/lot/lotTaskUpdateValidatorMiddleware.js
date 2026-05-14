const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { LotTaskStatus } = require("../../../generated/prisma");

const dto = z
  .object(
    {
      taskDescription: z.string({ message: "task_description_is_required" }).trim().min(1, { message: "task_description_is_required" }),
      completedDescription: z.string({ message: "completed_description_is_required" }).trim().optional(),
      status: z.enum(Object.values(LotTaskStatus), { message: "invalid_task_status" }),
      assigned: z
        .array(z.number({ required_error: "assigned_user_id_must_be_number", invalid_type_error: "assigned_user_id_must_be_number" }))
        .refine((arr) => arr.every((v) => Number.isInteger(v) && v > 0), { message: "assigned_user_id_must_be_positive_integer" }, { message: "assigned_users_value_must_be_in_array" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.lotTaskUpdateValidatorMiddleware = async (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
