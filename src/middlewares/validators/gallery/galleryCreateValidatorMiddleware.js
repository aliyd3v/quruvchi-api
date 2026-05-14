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

exports.galleryCreateValidatorMiddleware = async (req, _res, next) => {
  const parsedFile = fileDto.safeParse(req.file);
  if (parsedFile.error) {
    await fileService.unlinkFiles(req.file);
    return next(new AppError(400, "validation_error", formatZodError(parsedFile.error.issues)));
  }
  req.file = parsedFile.data;
  next();
};
