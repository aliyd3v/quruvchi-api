const { localErrorHandler } = require("../utils/localErrorHandler");
const { uploadFileToS3, cleanupLocalFiles, uploadFilesToS3 } = require("../utils/s3");

exports.uploadSingleFile = async (req, _res, next) => {
  try {
    if (req.file) req.uploadedFile = await uploadFileToS3(req.file);
    next();
  } catch (error) {
    await cleanupLocalFiles(req.file);
    next(localErrorHandler(error));
  }
};

exports.uploadMultipleFiles = async (req, _res, next) => {
  try {
    if (req.files && Array.isArray(req.files) && req.files?.length > 0) {
      req.uploadedFiles = await uploadFilesToS3(req.files);
    }
    next();
  } catch (error) {
    await cleanupLocalFiles(req.files);
    next(localErrorHandler(error));
  }
};

exports.uploadMultipleFields = async (req, _res, next) => {
  try {
    if (req.files && (req.files.invoiceFiles || req.files.bankAcceptanceFiles)) {
      if (req.files.invoiceFiles?.length) {
        req.uploadedInvoiceFiles = await uploadFilesToS3(req.files.invoiceFiles);
      }
      if (req.files.bankAcceptanceFiles?.length) {
        req.uploadedBankAcceptanceFiles = await uploadFilesToS3(req.files.bankAcceptanceFiles);
      }
    }
    next();
  } catch (error) {
    await cleanupLocalFiles(req.files);
    next(localErrorHandler(error));
  }
};
