const fs = require("fs");
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { S3_KEY, S3_SECRET, S3_REGION, S3_ENDPOINT, S3_BUCKET } = require("../config");
const { imageConverter } = require("./imageConverter");

async function cleanupLocalFiles(files) {
  if (!files) return;
  const fileList = Array.isArray(files) ? files : [files];
  await Promise.allSettled(
    fileList.map((file) => {
      if (!file?.path) return;
      return fs.promises.unlink(file.path).catch(() => {});
    }),
  );
}

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_KEY,
    secretAccessKey: S3_SECRET,
  },
});

const uploadFileToS3 = async (file) => {
  try {
    await imageConverter(file);

    const stream = fs.createReadStream(file.path);

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: S3_BUCKET,
        Key: file.filename,
        Body: stream,
        ContentType: file.mimetype,
      },
    });
    await upload.done();

    // const url = `${S3_ENDPOINT}/${S3_BUCKET}/${file.filename}`;  // Old verion.
    const url = `https://api.rsq.uz/file/${file.filename}`; // New version.

    const result = {
      originalname: file.originalname,
      filename: file.filename,
      filesize: file.size,
      mimeType: file.mimetype,
      url,
    };

    await cleanupLocalFiles(file);

    return result;
  } catch (error) {
    await cleanupLocalFiles(file);
    throw error;
  }
};

const uploadFilesToS3 = async (files) => {
  try {
    return await Promise.all(files.map((f) => uploadFileToS3(f)));
  } catch (error) {
    await cleanupLocalFiles(files);
    throw error;
  }
};

const getFile = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    return await s3.send(command);
  } catch (error) {
    throw error;
  }
};

const deleteFileFromS3 = async (filename) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: filename,
    });
    await s3.send(command);
    return;
  } catch (error) {
    // throw error;
    console.log(error);
  }
};

const deleteFilesFromS3 = async (filenames) => {
  try {
    await Promise.all(filenames.map(deleteFileFromS3));
    return;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  cleanupLocalFiles,
  uploadFileToS3,
  uploadFilesToS3,
  getFile,
  deleteFileFromS3,
  deleteFilesFromS3,
};
