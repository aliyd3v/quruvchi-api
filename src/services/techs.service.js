const AppError = require("../utils/AppError");
const { uploadFileToS3, deleteFileFromS3, deleteFilesFromS3 } = require("../utils/s3");
const fileService = require("./file.service");
const prisma = require("./prisma");

class techsService {
  async create(data, file, createdById) {
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
        const newTech = await tx.techs.create({
          data: {
            ...data,
            createdById,
          },
          select: { id: true },
        });

        if (file) {
          await tx.attachment.create({
            data: {
              url: uploaded.url,
              filename: uploaded.filename,
              mimeType: uploaded.mimeType,
              originalname: uploaded.originalname,
              filesize: uploaded.size,
              techsId: newTech.id,
              createdById,
            },
          });
        }
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
    let { page, limit, key, sortBy, reverse } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    key = typeof key === "string" ? key.trim() : null;
    reverse = reverse !== "false";
    sortBy = ["createdAt", "titleUz", "titleEn", "titleRu"].includes(sortBy) ? sortBy : "createdAt";

    const argsWhere = {
      isActive: true,
      ...(key && {
        OR: [{ titleUz: { contains: key, mode: "insensitive" } }, { titleRu: { contains: key, mode: "insensitive" } }, { titleEn: { contains: key, mode: "insensitive" } }],
      }),
    };

    try {
      const count = await prisma.techs.count({
        where: argsWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const techs = await prisma.techs.findMany({
        orderBy: { [sortBy]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: argsWhere,
        include: {
          image: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
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
        data: techs.map((t) => ({
          id: t.id,
          titleEn: t.titleEn,
          titleRu: t.titleRu,
          titleUz: t.titleUz,
          image: t.image[0]?.url || null,
          createdBy: t.createdBy,
          createdAt: t.createdAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicList(query) {
    let { page, limit } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 6;

    try {
      const count = await prisma.techs.count({
        where: { isActive: true },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const techs = await prisma.techs.findMany({
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
        data: techs.map((t) => ({
          id: t.id,
          titleEn: t.titleEn,
          titleRu: t.titleRu,
          titleUz: t.titleUz,
          image: t.image[0]?.url || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id) {
    try {
      const tech = await prisma.techs.findFirst({
        where: { id, isActive: true },
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
      if (!tech) {
        throw new AppError(404, "tech_not_found");
      }

      return {
        id: tech.id,
        titleUz: tech.titleUz,
        titleRu: tech.titleRu,
        titleEn: tech.titleEn,
        image: tech.image[0] || null,
        createdBy: tech.createdBy,
        createdAt: tech.createdAt,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(id, data, file, createdById) {
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
        const tech = await tx.techs.findFirst({
          where: { isActive: true, id },
          include: {
            image: true,
          },
        });
        if (!tech) {
          throw new AppError(404, "tech_not_found");
        }

        await tx.techs.update({
          where: { id },
          data,
        });

        if (uploaded) {
          await tx.attachment.deleteMany({
            where: { techsId: id },
          });

          await tx.attachment.create({
            data: {
              url: uploaded.url,
              filename: uploaded.filename,
              mimeType: uploaded.mimeType,
              originalname: uploaded.originalname,
              filesize: uploaded.size,
              createdById,
              techsId: id,
            },
          });

          for (const i of tech.image) {
            filesForDelete.push(i.filename);
          }
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
      const tech = await prisma.techs.findFirst({
        where: { isActive: true, id },
      });
      if (!tech) {
        throw new AppError(404, "tech_not_found");
      }

      await prisma.techs.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById,
          isActive: false,
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
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;

    try {
      const count = await prisma.techs.count({
        where: { isActive: false },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.techs.findMany({
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
      });

      return {
        page,
        limit,
        totalPage,
        totalCount: count,
        data: data.map((d) => ({
          id: d.id,
          titleUz: d.titleUz,
          deletedAt: d.deletedAt,
          deletedBy: d.deletedBy,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async restore(id) {
    try {
      const data = await prisma.techs.findFirst({
        where: { id, isActive: false },
      });
      if (!data) {
        throw new AppError(404, "tech_not_found");
      }

      await prisma.techs.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
          isActive: true,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async delete(id) {
    try {
      const data = await prisma.techs.findFirst({
        where: { id, isActive: false },
        include: { image: true },
      });
      if (!data) {
        throw new AppError(404, "tech_not_found");
      }

      await prisma.techs.delete({
        where: { id },
      });

      const filesForDelete = [];

      if (data.image.length > 0) {
        for (const i of data.image) {
          filesForDelete.push(i.filename);
        }
      }

      const filenames = filesForDelete.filter((f) => !!f);

      if (filenames.length > 0) {
        await deleteFilesFromS3(filenames);
      }

      return;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new techsService();
