const AppError = require("../utils/AppError");
const { uploadFileToS3, deleteFileFromS3, deleteFilesFromS3 } = require("../utils/s3");
const fileService = require("./file.service");
const prisma = require("./prisma");

class newsService {
  async _deleteUploadedFiles(uploadedFile, uploadedFiles) {
    if (uploadedFile) {
      await deleteFileFromS3(uploadedFile.filename);
    }
    if (uploadedFiles.length) {
      for (const uploadedFile of uploadedFiles) {
        await deleteFileFromS3(uploadedFile.filename);
      }
    }
  }

  async create(data, file, files, createdById) {
    let uploadedFile = null;
    const uploadedFiles = [];

    try {
      uploadedFile = await uploadFileToS3(file);
      for (const f of files) {
        const uploaded = await uploadFileToS3(f);
        uploadedFiles.push(uploaded);
      }
    } catch (error) {
      await fileService.unlinkFiles(file);
      await fileService.unlinkFiles(files);
      await this._deleteUploadedFiles(uploadedFile, uploadedFiles);
      throw error;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const newNews = await tx.news.create({
          data: {
            ...data,
            createdById,
          },
          select: { id: true },
        });

        await tx.attachment.create({
          data: {
            originalname: uploadedFile.originalname,
            filename: uploadedFile.filename,
            filesize: uploadedFile.size,
            mimeType: uploadedFile.mimeType,
            url: uploadedFile.url,
            previewImageNewsId: newNews.id,
            createdById,
          },
        });

        await tx.attachment.createMany({
          data: uploadedFiles.map((f) => ({
            originalname: f.originalname,
            filename: f.filename,
            filesize: f.size,
            mimeType: f.mimeType,
            url: f.url,
            imageNewsId: newNews.id,
            createdById,
          })),
        });

        return;
      });
    } catch (error) {
      await this._deleteUploadedFiles(uploadedFile, uploadedFiles);
      throw error;
    }

    return null;
  }

  async getList(query) {
    let { page, limit, sortBy, reverse, key } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    key = typeof key === "string" ? key.trim() : null;
    sortBy = ["createdAt", "updatedAt"].includes(sortBy) ? sortBy : "createdAt";
    reverse = reverse !== "false";

    const whereArgs = {
      isActive: true,
    };

    try {
      const count = await prisma.news.count({
        where: whereArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [news, totalCount] = await Promise.all([
        prisma.news.findMany({
          orderBy: { [sortBy]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: whereArgs,
          include: {
            createdBy: {
              where: { isActive: true },
              select: {
                fname: true,
                lname: true,
              },
            },
            previewImage: {
              where: { isActive: true },
              select: { url: true },
            },
          },
        }),
        prisma.news.count({
          where: { isActive: true },
        }),
      ]);

      return {
        data: news.map((s) => ({
          id: s.id,
          titleUz: s.titleUz,
          titleRu: s.titleRu,
          titleEn: s.titleEn,
          descriptionUz: s.descriptionUz,
          descriptionEn: s.descriptionEn,
          descriptionRu: s.descriptionRu,
          textUz: s.textUz,
          textEn: s.textEn,
          textRu: s.textRu,
          date: s.date,
          image: s.previewImage[0] || null,
          createdAt: s.createdAt,
          createdBy: s.createdBy,
        })),
        page,
        limit,
        count,
        totalPage,
        totalCount,
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicList(query) {
    let { page, limit } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;

    const whereArgs = {
      isActive: true,
    };

    try {
      const count = await prisma.news.count({
        where: whereArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [news, totalCount] = await Promise.all([
        prisma.news.findMany({
          orderBy: { date: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: whereArgs,
          include: {
            previewImage: {
              where: { isActive: true },
              select: { url: true },
            },
          },
        }),
        prisma.news.count({
          where: { isActive: true },
        }),
      ]);

      return {
        data: news.map((s) => ({
          id: s.id,
          titleUz: s.titleUz,
          titleRu: s.titleRu,
          titleEn: s.titleEn,
          descriptionUz: s.descriptionUz,
          descriptionEn: s.descriptionEn,
          descriptionRu: s.descriptionRu,
          textUz: s.textUz,
          textEn: s.textEn,
          textRu: s.textRu,
          date: s.date,
          image: s.previewImage[0] || null,
        })),
        page,
        limit,
        count,
        totalPage,
        totalCount,
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id) {
    try {
      const news = await prisma.news.findFirst({
        where: { id, isActive: true },
        include: {
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
          previewImage: {
            where: { isActive: true },
            select: { url: true },
          },
          images: {
            where: { isActive: true },
            select: { url: true, mimeType: true, id: true },
          },
        },
      });
      if (!news) {
        throw new AppError(404, "news_not_found");
      }

      return {
        id: news.id,
        titleEn: news.titleEn,
        titleRu: news.titleRu,
        titleUz: news.titleUz,
        descriptionEn: news.descriptionEn,
        descriptionRu: news.descriptionRu,
        descriptionUz: news.descriptionUz,
        textEn: news.textEn,
        textRu: news.textRu,
        textUz: news.textUz,
        date: news.date,
        createdBy: news.createdBy,
        previewImage: news.previewImage[0] || null,
        images: news.images,
        createdAt: news.createdAt,
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicById(id) {
    try {
      const news = await prisma.news.findFirst({
        where: { id, isActive: true },
        include: {
          images: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });
      if (!news) {
        throw new AppError(404, "news_not_found");
      }

      return {
        id: news.id,
        titleEn: news.titleEn,
        titleRu: news.titleRu,
        titleUz: news.titleUz,
        textEn: news.textEn,
        textRu: news.textRu,
        textUz: news.textUz,
        date: news.date,
        images: news.images.length > 0 ? news.images.map((i) => i.url) : [],
      };
    } catch (error) {
      throw error;
    }
  }

  async update(id, data, file, files, createdById) {
    let uploadedFile = null;
    const uploadedFiles = [];
    const prevImagesForDelete = [];

    try {
      if (file) {
        uploadedFile = await uploadFileToS3(file);
      }
      if (Array.isArray(files) && files.length) {
        for (const file of files) {
          const uploadedFile = await uploadFileToS3(file);
          uploadedFiles.push(uploadedFile);
        }
      }
    } catch (error) {
      await fileService.unlinkFiles(file);
      await fileService.unlinkFiles(files);
      if (uploadedFile) {
        await deleteFileFromS3(uploadedFile.filename);
      }
      if (uploadedFiles.length) {
        await deleteFilesFromS3(uploadedFiles.map((f) => f.filename));
      }
      throw error;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const news = await tx.news.findFirst({
          where: { id, isActive: true },
          include: {
            previewImage: true,
          },
        });
        if (!news) throw new AppError(404, "news_not_found");

        await tx.news.update({
          where: { id },
          data,
        });

        if (uploadedFile) {
          if (news.previewImage.length) {
            for (const prev of news.previewImage) {
              prevImagesForDelete.push(prev);
            }
            await tx.attachment.deleteMany({
              where: { id: { in: news.previewImage.map((a) => a.id) } },
            });
          }

          await tx.attachment.create({
            data: {
              originalname: uploadedFile.originalname,
              filename: uploadedFile.filename,
              filesize: uploadedFile.size,
              mimeType: uploadedFile.mimeType,
              url: uploadedFile.url,
              previewImageNewsId: id,
              createdById,
            },
          });
        }

        if (uploadedFiles.length > 0) {
          await tx.attachment.createMany({
            data: uploadedFiles.map((i) => ({
              originalname: i.originalname,
              filename: i.filename,
              filesize: i.size,
              mimeType: i.mimeType,
              url: i.url,
              imageNewsId: id,
              createdById,
            })),
          });
        }

        return;
      });
    } catch (error) {
      if (uploadedFile) {
        await deleteFileFromS3(uploadedFile.filename);
      }
      if (uploadedFiles.length) {
        await deleteFilesFromS3(uploadedFiles.map((f) => f.filename));
      }
      throw error;
    }

    if (prevImagesForDelete.length) {
      await deleteFilesFromS3(prevImagesForDelete.map((f) => f.filename));
    }

    return;
  }

  async softDelete(id, deletedById) {
    try {
      const news = await prisma.news.findFirst({
        where: { id, isActive: true },
      });
      if (!news) throw new AppError(404, "news_not_found");

      await prisma.news.update({
        where: { id },
        data: {
          isActive: false,
          deletedById,
          deletedAt: new Date(),
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async getTrash(query) {
    let { page, limit } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;

    try {
      const count = await prisma.news.count({
        where: { isActive: false },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [news] = await Promise.all([
        prisma.news.findMany({
          orderBy: { deletedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: { isActive: false },
          include: {
            deletedBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
          },
        }),
      ]);

      return {
        data: news.map((s) => ({
          id: s.id,
          titleUz: s.titleUz,
          deletedAt: s.deletedAt,
          deletedBy: s.deletedBy,
        })),
        page,
        limit,
        totalPage,
      };
    } catch (error) {
      throw error;
    }
  }

  async restore(id) {
    try {
      const news = await prisma.news.findFirst({
        where: { id, isActive: false },
      });
      if (!news) throw new AppError(404, "news_not_found");

      await prisma.news.update({
        where: { id },
        data: {
          isActive: true,
          deletedById: null,
          deletedAt: null,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async delete(id) {
    try {
      const news = await prisma.news.findFirst({
        where: { id, isActive: false },
        include: {
          previewImage: true,
          images: true,
        },
      });
      if (!news) throw new AppError(404, "news_not_found");

      await prisma.news.delete({
        where: { id },
      });

      if (news.previewImage.length) {
        await deleteFilesFromS3(news.previewImage.map((f) => f.filename));
      }

      if (news.images.length) {
        await deleteFilesFromS3(news.images.map((f) => f.filename));
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async deleteGalleryItem(id) {
    try {
      const galleryItem = await prisma.attachment.findFirst({
        where: { isActive: true, imageNewsId: { not: null }, id },
      });
      if (!galleryItem) {
        throw new AppError(404, "image_not_found");
      }

      await prisma.attachment.delete({
        where: { id },
      });

      await deleteFileFromS3(galleryItem.filename);

      return;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new newsService();
