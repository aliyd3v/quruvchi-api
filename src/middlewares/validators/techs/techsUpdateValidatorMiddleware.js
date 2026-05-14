const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");
const fileService = require("../../../services/file.service");

const fileDto = z
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
    { message: "image_cannot_be_empty" },
  )
  .refine((data) => data.mimetype.startsWith("image/"), { message: "file_must_be_image", path: ["file"] });

const dto = z
  .object(
    {
      titleUz: z.string({ message: "title_uz_must_be_string" }).nonempty({ message: "title_uz_cannot_be_empty" }),
      titleRu: z.string({ message: "title_ru_must_be_string" }).nonempty({ message: "title_ru_cannot_be_empty" }),
      titleEn: z.string({ message: "title_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.entries(d).length, { message: "body_is_required" });

exports.techsUpdateValidatorMiddleware = async (req, _res, next) => {
  let parsedFile = null;
  if (req.file) {
    parsedFile = fileDto.safeParse(req.file);
    if (parsedFile.error) {
      await fileService.unlinkFiles(req.file);
      return next(new AppError(400, "validation_error", formatZodError(parsedFile.error.issues)));
    }
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    if (req.file) {
      await fileService.unlinkFiles(req.file);
    }
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  if (parsedFile) {
    req.file = parsedFile.data;
  }
  next();
};
