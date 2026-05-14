const { z } = require("zod");
const fs = require("fs");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const avatarDto = z
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
  .refine((data) => data.mimetype.startsWith("image/"), { message: "file_must_be_image", path: ["file"] });

exports.imageValidatorMiddleware = async (req, _res, next) => {
  const parsed = avatarDto.safeParse(req.file);
  if (parsed.error) {
    if (req.file) {
      await fs.promises.unlink(req.file.path);
    }
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  next();
};
