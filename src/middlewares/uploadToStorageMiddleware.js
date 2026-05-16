const storage = require("../lib/storage");
const fileService = require("../services/file.service");
const { localErrorHandler } = require("../utils/localErrorHandler");

exports.uploadSingleFile = async (req, _res, next) => {
  try {
    if (req.file) req.uploadedFile = await storage.save(req.file);
    next();
  } catch (error) {
    await fileService.unlinkFiles(req.file);
    next(localErrorHandler(error));
  }
};

exports.uploadMultipleFiles = async (req, _res, next) => {
  try {
    if (req.files && Array.isArray(req.files) && req.files?.length > 0) {
      req.uploadedFiles = await storage.saveMany(req.files);
    }
    next();
  } catch (error) {
    await fileService.unlinkFiles(req.files);
    next(localErrorHandler(error));
  }
};

exports.uploadMultipleFields = async (req, _res, next) => {
  try {
    if (req.files && (req.files.invoiceFiles || req.files.bankAcceptanceFiles)) {
      if (req.files.invoiceFiles?.length) {
        req.uploadedInvoiceFiles = await storage.saveMany(req.files.invoiceFiles);
      }
      if (req.files.bankAcceptanceFiles?.length) {
        req.uploadedBankAcceptanceFiles = await storage.saveMany(req.files.bankAcceptanceFiles);
      }
    }
    next();
  } catch (error) {
    await fileService.unlinkFiles(req.files);
    next(localErrorHandler(error));
  }
};
