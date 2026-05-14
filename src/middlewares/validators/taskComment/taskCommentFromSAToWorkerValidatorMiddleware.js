const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const { TaskPriority } = require("@prisma/client");

const taskCommentFromSAToWorkerDto = z
  .object(
    {
      worker_id: z.number({ message: "task_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "task_id_must_be_positive_integer" }),
      task_id: z.number({ message: "task_id_must_be_number" }).refine((value) => !Number.isNaN(value) && value > 0, { message: "task_id_must_be_positive_integer" }),
      message: z.string({ message: "message_is_required" }).min(1, { message: "message_min_length_is_1" }).optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.taskCommentFromSAToWorkerValidatorMiddleware = (req, _res, next) => {
  const parsed = taskCommentFromSAToWorkerDto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
