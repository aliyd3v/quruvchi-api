const AppError = require("../utils/AppError");
const { uploadFileToS3, deleteFileFromS3, deleteFilesFromS3 } = require("../utils/s3");
const fileService = require("./file.service");
const prisma = require("./prisma");

class partnersService {
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
        const newPartner = await tx.partners.create({
          data: {
            ...data,
            createdById,
          },
          select: { id: true },
        });

        if (uploaded) {
          await tx.attachment.create({
            data: {
              url: uploaded.url,
              filename: uploaded.filename,
              originalname: uploaded.originalname,
              mimeType: uploaded.mimeType,
              filesize: uploaded.size,
              partnerId: newPartner.id,
              createdById,
            },
          });
        }

        return;
      });
    } catch (error) {
      if (uploaded) {
        deleteFileFromS3(uploaded.filename);
      }
      throw error;
    }
    return;
  }

  async getPublicList() {
    try {
      const partners = await prisma.partners.findMany({
        orderBy: { sortOrder: "asc" },
        where: { isActive: true },
        include: {
          image: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });
      return {
        totalCount: partners.length,
        data: partners.map((p) => ({
          title: p.title,
          image: p.image[0]?.url || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getList(query) {
    let { page, limit, key, reverse, sortBy } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    key = typeof key === "string" ? key.trim() : null;
    reverse = reverse === "true";
    sortBy = ["sortOrder", "createdAt", "title"].includes(sortBy) ? sortBy : "sortOrder";

    const argsWhere = {
      isActive: true,
      ...(key && { title: { contains: key, mode: "insensitive" } }),
    };

    try {
      const count = await prisma.partners.count({
        where: argsWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const partners = await prisma.partners.findMany({
        orderBy: { [sortBy]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: argsWhere,
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

      return {
        page,
        limit,
        totalPage,
        totalCount: count,
        sortBy,
        reverse,
        data: partners.map((p) => ({
          id: p.id,
          title: p.title,
          sortOrder: p.sortOrder,
          createdAt: p.createdAt,
          createdBy: p.createdBy,
          image: p.image[0] || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id) {
    try {
      const partner = await prisma.partners.findFirst({
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
      if (!partner) {
        throw new AppError(404, "partner_not_found");
      }

      return {
        id: partner.id,
        title: partner.title,
        sortOrder: partner.sortOrder,
        createdAt: partner.createdAt,
        createdBy: partner.createdBy,
        image: partner.image[0] || null,
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
        const partner = await tx.partners.findFirst({
          where: { isActive: true, id },
          include: {
            image: true,
          },
        });
        if (!partner) {
          throw new AppError(404, "partner_not_found");
        }

        await tx.partners.update({
          where: { id },
          data,
        });

        if (uploaded) {
          await tx.attachment.deleteMany({
            where: { partnerId: id },
          });

          await tx.attachment.create({
            data: {
              url: uploaded.url,
              filename: uploaded.filename,
              originalname: uploaded.originalname,
              mimeType: uploaded.mimeType,
              filesize: uploaded.size,
              partnerId: id,
              createdById,
            },
          });

          for (const i of partner.image) {
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
      const partner = await prisma.partners.findFirst({
        where: { isActive: true, id },
      });
      if (!partner) {
        throw new AppError(404, "partner_not_found");
      }

      await prisma.partners.update({
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
      const count = await prisma.partners.count({
        where: { isActive: false },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.partners.findMany({
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
          title: d.title,
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
      const data = await prisma.partners.findFirst({
        where: { isActive: false, id },
      });
      if (!data) {
        throw new AppError(404, "partner_not_found");
      }

      await prisma.partners.update({
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
      const data = await prisma.partners.findFirst({
        where: { isActive: false, id },
        include: {
          image: true,
        },
      });
      if (!data) {
        throw new AppError(404, "partner_not_found");
      }

      await prisma.partners.delete({
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

module.exports = new partnersService();
