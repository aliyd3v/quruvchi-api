const { Prisma } = require("../lib/prisma");
const AppError = require("./AppError");

exports.localErrorHandler = (error) => {
  if (error instanceof Prisma.PrismaClientInitializationError) return new AppError(500, "database_connection_error", error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = error.meta?.target?.[0];
      if (target === "email" || target === "phone") return new AppError(400, `${target}_already_taken`);
      return new AppError(400, `Duplicate value for: ${target}`);
    }
    if (error.code === "P2003") return new AppError(400, `Invalid reference: ${error.meta?.field_name}`);
    if (error.code === "P2025") return new AppError(404, "document_not_found");
    if (error.code === "P2024") return new AppError(503, "database_timeout");
  }
  if (error instanceof Prisma.PrismaClientValidationError) return new AppError(400, `invalid_input`, error.message);
  return error;
};
