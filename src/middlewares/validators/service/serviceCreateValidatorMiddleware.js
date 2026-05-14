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
      descriptionEn: z.string({ message: "description_en_must_be_string" }).nonempty({ message: "description_en_cannot_be_empty" }),
      descriptionUz: z.string({ message: "description_uz_must_be_string" }).nonempty({ message: "description_uz_cannot_be_empty" }),
      descriptionRu: z.string({ message: "description_ru_must_be_string" }).nonempty({ message: "description_ru_cannot_be_empty" }),
      sortOrder: z.preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") {
            return undefined;
          }
          return !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : v;
        },
        z.number({ message: "sort_order_must_be_integer_number" }),
      ),
      sections: z.preprocess(
        (v) => {
          if (!v) return [];
          try {
            return JSON.parse(v);
          } catch (error) {
            return v;
          }
        },
        z.array(
          z.object(
            {
              titleUz: z.string(),
              titleRu: z.string(),
              titleEn: z.string(),
              sortOrder: z.number().int(),
              content: z.array(
                z.object(
                  {
                    uz: z.string(),
                    ru: z.string(),
                    en: z.string(),
                  },
                  { message: "wrong_service_section_content" },
                ),
              ),
            },
            { message: "wrong_service_section_item" },
          ),
          { message: "wrong_service_sections_format" },
        ),
      ),
    },
    { message: "body_is_required" },
  )
  .refine((d) => Object.entries(d).length, { message: "body_is_required" });

exports.serviceCreateValidatorMiddleware = async (req, _res, next) => {
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
