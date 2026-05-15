const { ZodSchema } = require("zod");
const fileService = require("../services/file.service");
const { formatZodError } = require("../utils/formatZodError");

const validate = (opts = {}) => {
  const { dto = null, fileDto = null, filesDto = null, options: { hasSingle = false, hasArray = false, required = false } = {} } = opts;

  return async (req, _, next) => {
    if (dto) {
      const parsed = dto.safeParse(req.body);

      if (parsed.error) {
        if (req.file) {
          await fileService.unlinkFiles(req.files);
        }
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          await fileService.unlinkFiles(req.files);
        }
        return next(new AppError(400, "validation_error", formatZodError(parsed.error.issues)));
      }

      req.body = parsed.data;
    }

    if (fileDto && hasSingle) {
      const parsedFile = fileDto.safeParse(req.file);

      if (parsedFile.error) {
        if (req.file) {
          await fileService.unlinkFiles(req.file);
        }
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          await fileService.unlinkFiles(req.files);
        }
        return next(new AppError(400, "validation_error", formatZodError(parsedFile.error.issues)));
      }

      req.file = parsedFile.data;
    }

    if (filesDto && hasArray) {
      if (required && !Array.isArray(req.files) && req.files.length === 0) {
        return next(
          new AppError(
            400,
            "validation_error",
            formatZodError([
              {
                path: ["files"],
                message: "files_cannot_be_empty",
              },
            ]),
          ),
        );
      }

      const parsedFiles = filesDto.safeParse(req.files);

      if (parsedFiles.error) {
        if (req.file) {
          await fileService.unlinkFiles(req.file);
        }
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          await fileService.unlinkFiles(req.files);
        }
        return next(new AppError(400, "validation_error", formatZodError(parsedFiles.error.issues)));
      }

      req.files = parsedFiles.data;
    }

    next();
  };
};

module.exports = validate;
