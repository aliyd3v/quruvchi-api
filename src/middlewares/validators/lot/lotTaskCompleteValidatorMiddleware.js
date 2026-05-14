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
      completedDescription: z.string({ message: "completed_description_is_required" }).trim().min(1, { message: "completed_description_is_required" }),
    },
    { message: "body_is_required" }
  )
  .refine((data) => Object.keys(data).length > 0, { message: "body_is_required" });

exports.lotTaskCompleteValidatorMiddleware = async (req, _res, next) => {
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
