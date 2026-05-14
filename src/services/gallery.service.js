const AppError = require("../utils/AppError");
const { uploadFileToS3, deleteFileFromS3, deleteFilesFromS3 } = require("../utils/s3");
const fileService = require("./file.service");
const prisma = require("./prisma");

class galleryService {
  async create(file, createdById) {
    let uploaded = null;
    try {
      if (file) {
        uploaded = await uploadFileToS3(file);
      }
    } catch (error) {
      await fileService.unlinkFiles(file);
      throw error;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const newGallery = await tx.gallery.create({
          data: {
            createdById,
          },
        });

        if (uploaded) {
          await tx.attachment.create({
            data: {
              url: uploaded.url,
              filename: uploaded.filename,
              originalname: uploaded.originalname,
              filesize: uploaded.size,
              mimeType: uploaded.mimeType,
              galleryId: newGallery.id,
              createdById,
            },
          });
        }

        return;
      });
    } catch (error) {
      if (uploaded) {
        await deleteFileFromS3(uploaded.filename);
      }
      throw error;
    }

    return;
  }

  async getList(query) {
    let { page, limit, reverse, sortBy } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    reverse = reverse !== "false";
    sortBy = ["createdAt"].includes(sortBy) ? sortBy : "createdAt";

    try {
      const count = await prisma.gallery.count({
        where: { isActive: true },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const gallery = await prisma.gallery.findMany({
        orderBy: { [sortBy]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: { isActive: true },
        include: {
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
          image: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });

      return {
        page,
        limit,
        reverse,
        sortBy,
        totalPage,
        totalCount: count,
        data: gallery.map((g) => ({
          id: g.id,
          createdBy: g.createdBy,
          createdAt: g.createdAt,
          image: g.image[0] || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicList(query) {
    let { page, limit } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 9;

    try {
      const count = await prisma.gallery.count({
        where: { isActive: true },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const gallery = await prisma.gallery.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        where: { isActive: true },
        include: {
          image: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });

      return {
        page,
        limit,
        totalPage,
        totalCount: count,
        data: gallery.map((g) => g.image[0]?.url || null),
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id) {
    try {
      const gallery = await prisma.gallery.findFirst({
        where: { isActive: true, id },
        include: {
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
          image: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
        },
      });
      if (!gallery) {
        throw new AppError(404, "gallery_not_found");
      }

      return {
        id: gallery.id,
        createdBy: gallery.createdBy,
        createdAt: gallery.createdAt,
        image: gallery.image[0] || null,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(id, file, createdById) {
    let uploaded = null;
    const filesForDelete = [];

    if (file) {
      try {
        uploaded = await uploadFileToS3(file);
      } catch (error) {
        await fileService.unlinkFiles(file);
        throw error;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const gallery = await tx.gallery.findFirst({
          where: { isActive: true, id },
          include: {
            image: true,
          },
        });
        if (!gallery) {
          throw new AppError(404, "gallery_not_found");
        }

        await tx.attachment.deleteMany({
          where: { id: { in: gallery.image.map((i) => i.id) } },
        });

        if (uploaded) {
          await tx.attachment.create({
            data: {
              url: uploaded.url,
              filename: uploaded.filename,
              originalname: uploaded.originalname,
              filesize: uploaded.size,
              mimeType: uploaded.mimeType,
              galleryId: id,
              createdById,
            },
          });
        }

        for (const i of gallery.image) {
          filesForDelete.push(i.filename);
        }

        return;
      });
    } catch (error) {
      if (uploaded) {
        await deleteFileFromS3(uploaded.filename);
      }
      throw error;
    }

    if (filesForDelete.length > 0) {
      await deleteFilesFromS3(filesForDelete);
    }

    return;
  }

  async softDelete(id, deletedById) {
    try {
      const gallery = await prisma.gallery.findFirst({
        where: { isActive: true, id },
      });
      if (!gallery) {
        throw new AppError(404, "gallery_not_found");
      }

      await prisma.gallery.update({
        where: { id },
        data: {
          deletedById,
          deletedAt: new Date(),
          isActive: false,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new galleryService();
