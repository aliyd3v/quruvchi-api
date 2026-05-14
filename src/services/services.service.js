const AppError = require("../utils/AppError");
const { uploadFileToS3, deleteFileFromS3, deleteFilesFromS3 } = require("../utils/s3");
const fileService = require("./file.service");
const prisma = require("./prisma");

class servicesService {
  async create(data, file, createdById) {
    let uploaded = null;

    try {
      uploaded = await uploadFileToS3(file);
    } catch (error) {
      await fileService.unlinkFiles(file);
      throw error;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const { sections, ...cleanData } = data;
        const { id: serviceId } = await tx.services.create({
          data: { ...cleanData, createdById },
          select: { id: true },
        });

        if (sections.length) {
          await tx.serviceSection.createMany({
            data: sections.map((section) => ({
              titleEn: section.titleEn,
              titleRu: section.titleRu,
              titleUz: section.titleUz,
              content: section.content,
              sortOrder: section.sortOrder,
              serviceId,
            })),
          });
        }

        const { originalname, filename, size, mimeType, url } = uploaded;
        await tx.attachment.create({
          data: {
            serviceId,
            originalname,
            filename,
            filesize: size,
            mimeType,
            url,
            createdById,
          },
        });

        return;
      });
    } catch (error) {
      await deleteFileFromS3(uploaded.filename);
      throw error;
    }

    return;
  }

  async getById(id) {
    try {
      const service = await prisma.services.findFirst({
        where: { id, isActive: true },
        include: {
          createdBy: {
            where: { isActive: true },
            select: {
              fname: true,
              lname: true,
            },
          },
          image: {
            where: { isActive: true },
            select: { id: true, url: true, mimeType: true },
          },
          sections: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!service) {
        throw new AppError(404, "service_not_found");
      }

      return {
        ...service,
        image: service.image.length > 0 ? service.image[0] : null,
      };
    } catch (error) {
      throw error;
    }
  }

  async getByIdPublic(id) {
    try {
      const service = await prisma.services.findFirst({
        where: { id, isActive: true },
        include: {
          image: {
            where: { isActive: true },
            select: { url: true },
          },
          sections: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!service) {
        throw new AppError(404, "service_not_found");
      }

      return {
        id: service.id,
        titleUz: service.titleUz,
        titleRu: service.titleRu,
        titleEn: service.titleEn,
        descriptionEn: service.descriptionEn,
        descriptionRu: service.descriptionRu,
        descriptionUz: service.descriptionUz,
        image: service.image?.[0] || null,
        sections: service.sections,
      };
    } catch (error) {
      throw error;
    }
  }

  async getList(query) {
    let { page, limit, sortBy, reverse, key } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    key = typeof key === "string" ? key.trim() : null;
    sortBy = ["createdAt", "updatedAt", "sortOrder"].includes(sortBy) ? sortBy : "sortOrder";
    reverse = reverse !== "false";

    const whereArgs = {
      isActive: true,
    };

    try {
      const count = await prisma.services.count({
        where: whereArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [services, totalCount] = await Promise.all([
        prisma.services.findMany({
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
            image: {
              where: { isActive: true },
              select: { url: true },
            },
          },
        }),
        prisma.services.count({
          where: { isActive: true },
        }),
      ]);

      return {
        data: services.map((s) => ({
          id: s.id,
          sortOrder: s.sortOrder,
          titleUz: s.titleUz,
          titleRu: s.titleRu,
          titleEn: s.titleEn,
          descriptionUz: s.descriptionUz,
          descriptionEn: s.descriptionEn,
          descriptionRu: s.descriptionRu,
          image: s.image[0] || null,
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
      const count = await prisma.services.count({
        where: whereArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [services, totalCount] = await Promise.all([
        prisma.services.findMany({
          orderBy: { sortOrder: "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: whereArgs,
          include: {
            image: {
              where: { isActive: true },
              select: { url: true },
            },
          },
        }),
        prisma.services.count({
          where: { isActive: true },
        }),
      ]);

      return {
        data: services.map((s) => ({
          id: s.id,
          titleUz: s.titleUz,
          titleRu: s.titleRu,
          titleEn: s.titleEn,
          descriptionUz: s.descriptionUz,
          descriptionEn: s.descriptionEn,
          descriptionRu: s.descriptionRu,
          image: s.image[0] || null,
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

  async publicProjectsCategory() {
    try {
      const [services, totalCount] = await Promise.all([
        prisma.services.findMany({
          orderBy: { sortOrder: "asc" },
          where: { isActive: true },
        }),
        prisma.services.count({
          where: { isActive: true },
        }),
      ]);

      return {
        data: services.map((s) => ({
          id: s.id,
          titleUz: s.titleUz,
          titleRu: s.titleRu,
          titleEn: s.titleEn,
        })),
        totalCount,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(id, data, file, createdById) {
    let uploaded = null;
    const images = [];

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
        const service = await tx.services.findFirst({
          where: { id },
          include: { image: true },
        });
        if (!service) throw new AppError(404, "service_not_found");
        if (service.image.length) {
          for (const i of service.image) images.push(i);
        }

        await tx.services.update({
          where: { id },
          data,
        });

        if (uploaded) {
          if (images.length) {
            const deleteIds = images.map((i) => i.id);
            await tx.attachment.deleteMany({
              where: { id: { in: deleteIds } },
            });
          }

          await tx.attachment.create({
            data: {
              serviceId: id,
              originalname: uploaded.originalname,
              filename: uploaded.filename,
              filesize: uploaded.size,
              mimeType: uploaded.mimeType,
              url: uploaded.url,
              createdById,
            },
          });
        }

        return;
      });
    } catch (error) {
      if (uploaded) await deleteFileFromS3(uploaded.filename);
      throw error;
    }

    if (uploaded && images.length) {
      await deleteFilesFromS3(images.map((i) => i.filename));
    }

    return;
  }

  async softDelete(id, deletedById) {
    try {
      const service = await prisma.services.findFirst({
        where: { id, isActive: true },
      });
      if (!service) throw new AppError(404, "service_not_found");

      await prisma.services.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          deletedById,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async restore(id) {
    const service = await prisma.services.findFirst({
      where: { id, isActive: false },
    });
    if (!service) throw new AppError(404, "service_not_found");

    await prisma.services.update({
      where: { id },
      data: {
        isActive: true,
        deletedAt: null,
        deletedById: null,
      },
    });

    return;
  }

  async delete(id) {
    const service = await prisma.services.findFirst({
      where: { id, isActive: false },
      include: { image: true },
    });
    if (!service) throw new AppError(404, "service_not_found");

    await prisma.services.delete({
      where: { id },
    });

    if (service.image.length) {
      await deleteFilesFromS3(service.image.map((i) => i.filename));
    }

    return;
  }

  async getSectionById(id) {
    try {
      const section = await prisma.serviceSection.findUnique({
        where: { id },
      });
      if (!section) throw new AppError(404, "service_section_not_found");

      return section;
    } catch (error) {
      throw error;
    }
  }

  async createSection(serviceId, data) {
    try {
      await this.getById(serviceId);

      await prisma.serviceSection.create({
        data: {
          ...data,
          serviceId,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async updateSection(id, data) {
    try {
      await this.getSectionById(id);

      await prisma.serviceSection.update({
        where: { id },
        data,
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async deleteSection(id) {
    try {
      await this.getSectionById(id);

      await prisma.serviceSection.delete({
        where: { id },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async createOrder({ serviceId, data } = {}) {
    try {
      const service = await prisma.services.findFirst({
        where: { isActive: true, id: serviceId },
      });
      if (!service) {
        throw new AppError(404, "service_not_found");
      }

      await prisma.inbox.create({
        data: {
          ...data,
          serviceId,
          type: "ORDER_SERVICE",
        },
      });

      const responsible = await prisma.user.findMany({
        where: { isActive: true, permissions: { hasSome: ["website_management"] } },
      });
      if (responsible.length > 0) {
        const d = new Date();
        const currentUTCHour = d.getUTCHours();

        if (currentUTCHour > 4 && currentUTCHour < 15) {
          await Promise.all(responsible.map(async (user) => await callService.call(user.phone, "NEW_INBOX")));
        } else {
          await prisma.callEvent.createMany({
            data: responsible.map((u) => ({
              type: "NEW_INBOX",
              userId: u.id,
            })),
          });
        }
      }

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
      const count = await prisma.services.count({
        where: { isActive: false },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.services.findMany({
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
}

module.exports = new servicesService();
