const firebase = require("firebase-admin");
const { getStorage } = require("firebase-admin/storage");
const Config = require("../config");
const prisma = require("../lib/prisma");

async function cleanupLocalFiles(files) {
  if (!files) return;
  const fileList = Array.isArray(files) ? files : Object.values(files).flat();
  await Promise.allSettled(fileList.map((file) => fs.promises.unlink(file.path).catch(() => {})));
}

firebase.initializeApp({
  credential: firebase.credential.cert({
    projectId: Config.FIREBASE_PROJECT_ID,
    clientEmail: Config.FIREBASE_CLIENT_EMAIL,
    privateKey: Config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  storageBucket: `${Config.FIREBASE_PROJECT_ID}.firebasestorage.app`,
});

const bucket = getStorage().bucket();

async function cleanupFirebaseFiles(filenames) {
  if (!filenames || filenames.length === 0) return;
  await Promise.allSettled(
    filenames.map((filename) =>
      bucket
        .file(`uploads/${filename}`)
        .delete()
        .catch(() => {}),
    ),
  );
}

async function uploadToStorage(file) {
  const blob = bucket.file(`uploads/${file.filename}`);
  const blobStream = blob.createWriteStream({
    resumable: false,
    contentType: file.mimetype,
  });

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(file.path).pipe(blobStream);
      blobStream.on("finish", resolve);
      blobStream.on("error", reject);
    });
    await blob.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    await fs.promises.unlink(file.path);
    return { originalname: file.originalname, filename: file.filename, size: file.size, mimeType: file.mimetype, url };
  } catch (error) {
    await fs.promises.unlink(file.path).catch(() => {});
    await blob.delete().catch(() => {});
    throw error;
  }
}

async function deleteFileFromStorage(filename) {
  try {
    await bucket.file(`uploads/${filename}`).delete();
  } catch (error) {
    if (error.code === 404) {
      console.log(`${filename} not found`);
      return;
    }
    console.log(error);
  }
  return;
}

async function deleteFilesFromStorage(arr) {
  if (!Array.isArray(arr)) {
    return;
  }
  await Promise.all(arr.map((filename) => deleteFileFromStorage(filename)));
}

async function getFilenamesFromDatabase() {
  const filenames = [];
  const attachments = await prisma.attachment.findMany({ select: { filename: true } });
  for (const f of attachments) {
    filenames.push(f.filename);
  }
  const avatars = await prisma.avatar.findMany({ select: { filename: true } });
  for (const f of avatars) {
    filenames.push(f.filename);
  }
  return filenames;
}

async function getAllFilesFromStorage(prefix = "uploads/") {
  try {
    const [files] = await bucket.getFiles({ prefix });
    return files.map((file) => file.name.replace(prefix, ""));
  } catch (error) {
    return [];
  }
}

async function cleanupOrphanedFiles() {
  try {
    const storageFiles = await getAllFilesFromStorage();
    const dbFiles = await getFilenamesFromDatabase();
    const orphanedFiles = storageFiles.filter((file) => !dbFiles.includes(file));
    if (orphanedFiles.length > 0) {
      await deleteFilesFromStorage(orphanedFiles);
    }
    return {
      total: storageFiles.length,
      deleted: orphanedFiles.length,
      remaining: storageFiles.length - orphanedFiles.length,
    };
  } catch (error) {
    console.log("Cleanup orphaned files error: ", error);
    return;
  }
}

module.exports = {
  bucket,
  deleteFileFromStorage,
  deleteFilesFromStorage,
  cleanupOrphanedFiles,
  cleanupLocalFiles,
  cleanupFirebaseFiles,
  uploadToStorage,
};
