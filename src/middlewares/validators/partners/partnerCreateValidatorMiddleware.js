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
      title: z.string({ message: "title_must_be_string" }).nonempty({ message: "title_cannot_be_empty" }),
      sortOrder: z.preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") {
            return undefined;
          }
          return !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : v;
        },
        z.number({ message: "sort_order_must_be_integer_number" }),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.entries(d).length, { message: "body_is_required" });

exports.partnerCreateValidatorMiddleware = async (req, _res, next) => {
  const parsedFile = fileDto.safeParse(req.file);
  if (parsedFile.error) {
    await fileService.unlinkFiles(req.file);
    return next(new AppError(400, "validation_error", formatZodError(parsedFile.error.issues)));
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    await fileService.unlinkFiles(req.file);
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  if (parsedFile) req.file = parsedFile.data;
  next();
};
