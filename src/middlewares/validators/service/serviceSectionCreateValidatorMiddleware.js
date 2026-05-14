const { z } = require("zod");
const AppError = require("../../../utils/AppError");
const { formatZodError } = require("../../../utils/formatZodError");

const dto = z
  .object(
    {
      titleUz: z.string({ message: "title_uz_must_be_string" }).nonempty({ message: "title_uz_cannot_be_empty" }),
      titleRu: z.string({ message: "title_ru_must_be_string" }).nonempty({ message: "title_ru_cannot_be_empty" }),
      titleEn: z.string({ message: "title_en_must_be_string" }).nonempty({ message: "title_en_cannot_be_empty" }),
      sortOrder: z.number({ message: "sort_order_must_be_number" }).int({ message: "sort_order_must_be_integer" }),
      content: z.array(
        z.object(
          {
            uz: z.string({ message: "uz_must_be_string" }).nonempty({ message: "uz_cannot_be_empty" }),
            ru: z.string({ message: "ru_must_be_string" }).nonempty({ message: "ru_cannot_be_empty" }),
            en: z.string({ message: "en_must_be_string" }).nonempty({ message: "en_cannot_be_empty" }),
          },
          { message: "wrong_service_section_content" },
        ),
      ),
    },
    { message: "wrong_service_section_item" },
  )
  .refine((d) => Object.entries(d).length, { message: "body_is_required" });

exports.serviceSectionCreateValidatorMiddleware = async (req, _res, next) => {
  const parsed = dto.safeParse(req.body);
  if (parsed.error) {
    return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
  }
  req.body = parsed.data;
  next();
};
