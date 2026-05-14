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

const filesDto = z.array(
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
      { message: "image_cannot_be_empty" },
    )
    .refine((data) => data.mimetype.startsWith("image/"), { message: "files_must_be_image", path: ["files"] }),
  { message: "files_must_be_array" },
);

const dto = z
  .object(
    {
      sku: z
        .string({ message: "sku_must_be_string" })
        .optional()
        .transform((v) => (typeof v === "string" ? v.trim() : null)),
      isVisible: z.preprocess((v) => v === "true", z.boolean()),
      price: z.preprocess(
        (v) => {
          const value = !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? BigInt(Math.round(v * 100)) : null;
          if (value !== null && value > 999999999999999999n) return null;
          return value;
        },
        z.union([z.bigint({ message: "price_must_be_number_and_not_so_big" })]),
      ),
      parameter: z.string({ message: "parameter_must_be_string" }).trim().nonempty({ message: "parameter_cannot_be_empty" }),
      titleUz: z.string({ message: "title_uz_must_be_string" }).nonempty({ message: "title_uz_cannot_be_empty" }),
      titleRu: z.string({ message: "title_ru_must_be_string" }).nonempty({ message: "title_ru_cannot_be_empty" }),
      titleEn: z.string({ message: "title_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
      descUz: z.string({ message: "description_uz_must_be_string" }).nonempty({ message: "description_uz_cannot_be_empty" }),
      descRu: z.string({ message: "description_ru_must_be_string" }).nonempty({ message: "description_ru_cannot_be_empty" }),
      descEn: z.string({ message: "description_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.keys(d).length > 0, { message: "body_is_required" });

exports.catalogUpdateValidatorMiddleware = async (req, _res, next) => {
  const file = req.files?.file;
  const files = req.files?.files;

  let parsedFile = [];
  let parsedFiles = [];

  if (Array.isArray(file) && file.length) {
    parsedFile = fileDto.safeParse(file[0]);
    if (parsedFile.error) {
      await fileService.unlinkFiles(file);
      await fileService.unlinkFiles(files);
      return next(new AppError(400, "validation_error", formatZodError(parsedFile.error.issues)));
    }
  }
  if (Array.isArray(files) && files.length) {
    parsedFiles = filesDto.safeParse(files);
    if (parsedFiles.error) {
      await fileService.unlinkFiles(file);
      await fileService.unlinkFiles(files);
      return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
    }
  }
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    await fileService.unlinkFiles(file);
    await fileService.unlinkFiles(files);
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  req.files["file"] = [parsedFile.data];
  req.files["files"] = parsedFiles.data;
  next();
};
