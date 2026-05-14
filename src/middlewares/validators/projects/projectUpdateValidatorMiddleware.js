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
      serviceId: z.preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") return null;
          return !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : null;
        },
        z.union([z.number(), z.null()]),
      ),
      titleUz: z.string({ message: "title_uz_must_be_string" }).nonempty({ message: "title_uz_cannot_be_empty" }),
      titleRu: z.string({ message: "title_ru_must_be_string" }).nonempty({ message: "title_ru_cannot_be_empty" }),
      titleEn: z.string({ message: "title_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
      descriptionEn: z.string({ message: "description_en_must_be_string" }).nonempty({ message: "description_en_cannot_be_empty" }),
      descriptionUz: z.string({ message: "description_uz_must_be_string" }).nonempty({ message: "description_uz_cannot_be_empty" }),
      descriptionRu: z.string({ message: "description_ru_must_be_string" }).nonempty({ message: "description_ru_cannot_be_empty" }),
      date: z.preprocess((v) => (!isNaN(Date.parse(v)) ? new Date(v) : null), z.date({ message: "invalid_date" })),
      location: z.string().optional(),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.entries(d).length, { message: "body_is_required" });

exports.projectUpdateValidatorMiddleware = async (req, _res, next) => {
  const { ["file"]: file, ["files"]: files } = req.files;
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
