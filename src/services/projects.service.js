const AppError = require("../utils/AppError");
const { uploadFileToS3, deleteFileFromS3, deleteFilesFromS3 } = require("../utils/s3");
const fileService = require("./file.service");
const prisma = require("./prisma");

class projectsService {
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
        const { serviceId } = data;
        if (serviceId) {
          const service = await tx.services.findFirst({
            where: { id: serviceId, isActive: true },
          });
          if (!service) {
            throw new AppError(404, "service_not_found");
          }
        }

        const newProject = await tx.project.create({
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
            previewImageProjectId: newProject.id,
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
            imageProjectId: newProject.id,
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
    let { page, limit, serviceId, sortBy, key, reverse } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    serviceId = !isNaN(Number(serviceId)) && Number(serviceId) > 0 && Number.isInteger(Number(serviceId)) ? Number(serviceId) : null;
    sortBy = ["titleUz", "titleRu", "titleEn", "descriptionUz", "descriptionRu", "descriptionEn", "location", "date", "createdAt"].includes(sortBy) ? sortBy : "createdAt";
    key = typeof key === "string" ? key.trim() : null;
    reverse = reverse !== "false";

    try {
      if (serviceId) {
        const service = await prisma.services.findFirst({
          where: { isActive: true, id: serviceId },
          select: { id: true },
        });
        if (!service) {
          serviceId = null;
        }
      }

      const argsWhere = {
        isActive: true,
        ...(serviceId && { serviceId }),
        ...(key && {
          OR: [
            { titleUz: { contains: key, mode: "insensitive" } },
            { titleRu: { contains: key, mode: "insensitive" } },
            { titleEn: { contains: key, mode: "insensitive" } },
            { descriptionUz: { contains: key, mode: "insensitive" } },
            { descriptionRu: { contains: key, mode: "insensitive" } },
            { descriptionEn: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.project.count({
        where: argsWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const projects = await prisma.project.findMany({
        orderBy: { [sortBy]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: argsWhere,
        include: {
          service: {
            where: { isActive: true },
            select: {
              id: true,
              titleEn: true,
              titleRu: true,
              titleUz: true,
            },
          },
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
          previewImage: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });

      return {
        totalCount: count,
        limit,
        page,
        reverse,
        sortBy,
        serviceId,
        data: projects.map((p) => ({
          id: p.id,
          titleEn: p.titleEn,
          titleRu: p.titleRu,
          titleUz: p.titleUz,
          location: p.location,
          service: p.service,
          serviceId: p.serviceId,
          createdBy: p.createdBy,
          createdAt: p.createdAt,
          image: p.previewImage[0] || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicList(query) {
    let { page, limit, serviceId } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
    serviceId = !isNaN(Number(serviceId)) && Number(serviceId) > 0 && Number.isInteger(Number(serviceId)) ? Number(serviceId) : null;

    try {
      if (serviceId) {
        const service = await prisma.services.findFirst({
          where: { isActive: true, id: serviceId },
          select: { id: true },
        });
        if (!service) {
          serviceId = null;
        }
      }

      const argsWhere = {
        isActive: true,
        ...(serviceId && { serviceId }),
      };

      const count = await prisma.project.count({
        where: argsWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const projects = await prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        where: argsWhere,
        include: {
          service: {
            where: { isActive: true },
            select: {
              titleEn: true,
              titleRu: true,
              titleUz: true,
            },
          },
          previewImage: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });

      return {
        totalCount: count,
        limit,
        page,
        serviceId,
        data: projects.map((p) => ({
          id: p.id,
          titleEn: p.titleEn,
          titleRu: p.titleRu,
          titleUz: p.titleUz,
          location: p.location,
          service: p.service,
          image: p.previewImage?.[0] || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getTrash(query) {
    let { page, limit } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;

    try {
      const count = await prisma.project.count({
        where: { isActive: false },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.project.findMany({
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
      const data = await prisma.project.findFirst({
        where: { isActive: false, id },
      });
      if (!data) {
        throw new AppError(404, "project_not_found");
      }

      await prisma.project.update({
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
      const data = await prisma.project.findFirst({
        where: { isActive: false, id },
        include: {
          images: true,
          previewImage: true,
        },
      });
      if (!data) {
        throw new AppError(404, "project_not_found");
      }

      await prisma.project.delete({
        where: { id },
      });

      const filesForDelete = [];

      if (data.images.length > 0) {
        for (const i of data.images) {
          filesForDelete.push(i.filename);
        }
      }

      if (data.previewImage.length > 0) {
        for (const i of data.previewImage) {
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

  async getById(id) {
    try {
      const project = await prisma.project.findFirst({
        where: { id, isActive: true },
        include: {
          images: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
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
          service: {
            where: { isActive: true },
            select: {
              id: true,
              titleEn: true,
              titleRu: true,
              titleUz: true,
            },
          },
        },
      });
      if (!project) throw new AppError(404, "project_not_found");

      return project;
    } catch (error) {
      throw error;
    }
  }

  async getPublicById(id) {
    try {
      const project = await prisma.project.findFirst({
        where: { id, isActive: true },
        include: {
          images: {
            where: { isActive: true },
            select: { url: true },
          },
          service: {
            where: { isActive: true },
            select: {
              id: true,
              titleEn: true,
              titleRu: true,
              titleUz: true,
            },
          },
        },
      });
      if (!project) throw new AppError(404, "project_not_found");

      return {
        id: project.id,
        date: project.date,
        descriptionEn: project.descriptionEn,
        descriptionRu: project.descriptionRu,
        descriptionUz: project.descriptionUz,
        titleEn: project.titleEn,
        titleRu: project.titleRu,
        titleUz: project.titleUz,
        images: project.images,
        location: project.location,
        service: project.service,
      };
    } catch (error) {
      throw error;
    }
  }

  async update(id, data, file, files, createdById) {
    let uploaded = null;
    const uploadedFiles = [];
    const filesForDelete = [];
    const attachmentsForDelete = [];
    const { serviceId } = data;

    try {
      if (file) {
        uploaded = await uploadFileToS3(file);
      }
      if (Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          const uploaded = await uploadFileToS3(file);
          if (uploaded) {
            uploadedFiles.push(uploaded);
          }
        }
      }
    } catch (error) {
      if (file) {
        await fileService.unlinkFiles(file);
      }
      if (Array.isArray(files) && files.length) {
        await fileService.unlinkFiles(files);
      }
      if (uploaded) {
        await deleteFileFromS3(uploaded.filename);
      }
      if (uploadedFiles.length > 0) {
        await deleteFilesFromS3(uploadedFiles.map((file) => file.filename));
      }
      throw error;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { isActive: true, id },
          include: {
            previewImage: true,
          },
        });
        if (!project) {
          throw new AppError(404, "project_not_found");
        }

        if (serviceId) {
          const service = await tx.services.findFirst({
            where: { isActive: true, id: serviceId },
          });
          if (!service) {
            throw new AppError(404, "service_not_found");
          }
        }

        await tx.project.update({
          where: { id },
          data,
        });

        if (uploaded) {
          for (const a of project.previewImage) {
            attachmentsForDelete.push(a.id);
            filesForDelete.push(a.filename);
          }
          await tx.attachment.create({
            data: {
              url: uploaded.url,
              originalname: uploaded.originalname,
              filename: uploaded.filename,
              filesize: uploaded.size,
              mimeType: uploaded.mimeType,
              createdById,
              previewImageProjectId: id,
            },
          });
        }

        if (uploadedFiles.length > 0) {
          await tx.attachment.createMany({
            data: uploadedFiles.map((uploaded) => ({
              url: uploaded.url,
              originalname: uploaded.originalname,
              filename: uploaded.filename,
              filesize: uploaded.size,
              mimeType: uploaded.mimeType,
              createdById,
              imageProjectId: id,
            })),
          });
        }

        if (attachmentsForDelete.length > 0) {
          await tx.attachment.deleteMany({
            where: { id: { in: attachmentsForDelete } },
          });
        }
      });
    } catch (error) {
      if (uploaded) {
        await deleteFileFromS3(uploaded.filename);
      }
      if (uploadedFiles.length > 0) {
        await deleteFilesFromS3(uploadedFiles.map((file) => file.filename));
      }
      throw error;
    }

    if (filesForDelete.length > 0) {
      await deleteFilesFromS3(filesForDelete);
    }

    return null;
  }

  async softDelete(id, deletedById) {
    try {
      const project = await prisma.project.findFirst({
        where: { isActive: true, id },
        select: { id: true },
      });
      if (!project) {
        throw new AppError(404, "project_not_found");
      }

      await prisma.project.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById,
          isActive: false,
        },
      });

      return null;
    } catch (error) {
      throw error;
    }
  }

  async deleteGalleryItem(id) {
    try {
      const attachment = await prisma.attachment.findFirst({
        where: { isActive: true, imageProjectId: { not: null } },
      });
      if (!attachment) {
        throw new AppError(404, "image_not_found");
      }

      await prisma.attachment.delete({
        where: { id },
      });

      await deleteFileFromS3(attachment.filename);

      return null;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new projectsService();
