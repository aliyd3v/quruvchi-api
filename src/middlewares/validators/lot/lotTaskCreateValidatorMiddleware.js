const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const fileService = require("../../../services/file.service");

const attachmentCreateFilesDto = z.array(
  z.object(
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
);

const dto = z
  .object(
    {
      taskDescription: z.string({ message: "task_description_is_required" }).trim().min(1, { message: "task_description_is_required" }),
      assigned: z.preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") {
            return undefined;
          }
          if (typeof v === "string") {
            try {
              return JSON.parse(v);
            } catch (e) {
              return v;
            }
          }
          return v;
        },
        z
          .array(z.number({ required_error: "assigned_user_id_must_be_number", invalid_type_error: "assigned_user_id_must_be_number" }))
          .refine((arr) => arr.every((v) => Number.isInteger(v) && v > 0), { message: "assigned_user_id_must_be_positive_integer" }, { message: "assigned_users_value_must_be_in_array" })
      ),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.lotTaskCreateValidatorMiddleware = async (req, _res, next) => {
  let parsedFiles = null;
  if (req.files) {
    if (!Array.isArray(req.files)) {
      return next(new AppError(400, "validation_error", formatZodError([{ path: ["files"], message: "files_cannot_be_empty" }])));
    }
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
  if (parsedFiles) {
    req.files = parsedFiles.data;
  }
  next();
};
