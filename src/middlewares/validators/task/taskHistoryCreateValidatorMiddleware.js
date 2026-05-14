const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const fileService = require("../../../services/file.service");

const attachmentCreateFilesDto = z
  .array(
    z
      .object(
        {
          fieldname: z.string(),
          originalname: z.string(),
          encoding: z.string(),
          mimetype: z.string(),
          destination: z.string(),
          filename: z.string(),
          path: z.string(),
          size: z.number(),
        },
        { message: "profile_image_cannot_be_empty" }
      )
      .refine((data) => data.mimetype.startsWith("image/"), { message: "file_must_be_image", path: ["files"] })
  )
  .refine(
    (data) => {
      return data.length > 0;
    },
    { message: "files_cannot_be_empty", path: ["files"] }
  );

const dto = z
  .object(
    {
      taskId: z.preprocess((val) => {
        if (val === undefined || val === null || val === "") return undefined;
        if (typeof val === "string") return Number(val);
        return val;
      }, z.union([z.number({ invalid_type_error: "task_id_must_be_number" }).refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "invalid_task_id" }), z.undefined().refine(() => false, { message: "task_id_required" })])),
      quantityOfCompleted: z.preprocess((val) => {
        if (val === undefined || val === null || val === "") return undefined;
        if (typeof val === "string") return Number(val);
        return val;
      }, z.union([z.number({ invalid_type_error: "quantity_of_complated_must_be_number" }).refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, { message: "quantity_of_complated_cannot_be_equal_to_zero" }), z.undefined().refine(() => false, { message: "quantity_of_complated_required" })])),
      description: z.any().optional(),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.taskHistoryCreateValidatorMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files) {
    if (!Array.isArray(req.files)) return next(new AppError(400, "validation_error", formatZodError([{ path: ["files"], message: "files_cannot_be_empty" }])));
    parsedFiles = attachmentCreateFilesDto.safeParse(req.files);
    if (parsedFiles.error) {
      if (req.files && Array.isArray(req.files) && req.files.length) await fileService.unlinkFiles(req.files);
      return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
    }
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    if (req.files && Array.isArray(req.files) && req.files.length) await fileService.unlinkFiles(req.files);
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  if (parsedFiles) req.files = parsedFiles.data;
  next();
};
