const { Unit } = require("../generated/prisma");
const AppError = require("../utils/AppError");
const prisma = require("../lib/prisma");
const fileService = require("./file.service");
const storage = require("../lib/storage");

class catalogService {
  async createDirection({ data, createdById, file } = {}) {
    let uploaded = null;

    if (file) {
      try {
        uploaded = await storage.save(file);
      } catch (error) {
        await fileService.unlinkFiles(file);
        throw error;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const direction = await prisma.catalogDirection.create({
          data: {
            ...data,
            createdById,
          },
        });

        if (uploaded) {
          await prisma.attachment.create({
            data: {
              ...uploaded,
              catalogDirectionId: direction.id,
            },
          });
        }

        return;
      });
    } catch (error) {
      if (uploaded) {
        await storage.delete(uploaded.filename);
      }
      throw error;
    }

    return;
  }

  async getDirectionsList(query) {
    try {
      let { page, limit, sort, reverse, key } = query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;
      sort = ["createdAt", "titleUz", "updatedAt"].includes(sort) ? sort : "titleUz";
      reverse = reverse === "true";

      const findArgs = {
        isActive: true,
        ...(key && { name: { contains: key, mode: "insensitive" } }),
      };

      const count = await prisma.catalogDirection.count({
        where: findArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [directions, agg] = await Promise.all([
        prisma.catalogDirection.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findArgs,
          include: {
            createdBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            image: {
              where: { isActive: true },
              select: { url: true, mimeType: true },
            },
            _count: {
              select: {
                catalogs: {
                  where: { isActive: true },
                },
              },
            },
            catalogs: {
              where: { isActive: true },
              include: {
                items: {
                  where: { isActive: true },
                  select: {
                    totalPrice: true,
                  },
                },
              },
            },
          },
        }),
        prisma.catalog.aggregate({
          _count: { _all: true },
          where: { isActive: true },
        }),
      ]);

      const totalAmount = directions.reduce((sum, d) => sum + (d.catalogs.reduce((cSum, c) => cSum + c.items.reduce((iSum, i) => iSum + (i.totalPrice || 0n), 0n), 0n) || 0n), 0n) || 0;

      return {
        page,
        limit,
        reverse,
        sort,
        totalPage,
        totalCount: agg._count._all,
        totalAmount,
        data: directions.map((d) => ({
          id: d.id,
          titleUz: d.titleUz,
          titleRu: d.titleRu,
          titleEn: d.titleEn,
          image: d.image[0] || null,
          catalogCount: d._count.catalogs,
          createdBy: d.createdBy,
          createdAt: d.createdAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicDirectionsList() {
    try {
      const directions = prisma.catalogDirection.findMany({
        orderBy: { createdAt: "desc" },
        where: { isActive: true },
        select: {
          id: true,
          titleEn: true,
          titleRu: true,
          titleUz: true,
        },
      });

      return directions;
    } catch (error) {
      throw error;
    }
  }

  async searchDirection(query) {
    const key = typeof query.key === "string" ? query.key.trim() : null;
    try {
      const data = await prisma.catalogDirection.findMany({
        where: {
          isActive: true,
          ...(key && {
            titleUz: { contains: key, mode: "insensitive" },
            titleRu: { contains: key, mode: "insensitive" },
            titleEn: { contains: key, mode: "insensitive" },
          }),
        },
        select: {
          id: true,
          titleUz: true,
        },
      });

      return data;
    } catch (error) {
      throw error;
    }
  }

  async _directionById(id) {
    try {
      const direction = await prisma.catalogDirection.findUnique({
        where: { id },
        include: {
          image: {
            where: { isActive: true },
            select: {
              id: true,
              filename: true,
              url: true,
              mimeType: true,
            },
          },
        },
      });
      if (!direction) throw new AppError(404, "direction_not_found");

      return direction;
    } catch (error) {
      throw error;
    }
  }

  async directionById(id) {
    try {
      const direction = await this._directionById(id);
      return {
        ...direction,
        image: direction.image?.[0] || null,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateDirection({ id, data, file, createdById }) {
    let uploaded = null;
    const filesForRemove = [];

    if (file) {
      try {
        uploaded = await storage.save(file);
      } catch (error) {
        await fileService.unlinkFiles(file);
        throw error;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const direction = await tx.catalogDirection.findFirst({
          where: { id, isActive: true },
          include: {
            image: true,
          },
        });
        if (!direction) throw new AppError(404, "direction_not_found");

        // Update direction.
        await tx.catalogDirection.update({
          where: { id },
          data: { ...data },
        });

        if (uploaded) {
          await tx.attachment.delete({
            where: { catalogDirectionId: id },
          });

          await tx.attachment.create({
            data: {
              ...uploaded,
              catalogDirectionId: id,
              createdById,
            },
          });

          if (direction.image.length) {
            for (const f of direction.image) {
              filesForRemove.push(f.filename);
            }
          }
        }

        return;
      });
    } catch (error) {
      if (uploaded) {
        await storage.delete(uploaded.filename);
      }
      throw error;
    }

    if (filesForRemove.length) {
      await storage.deleteMany(filesForRemove);
    }

    return;
  }

  async softDeleteDirection(id, deletedById) {
    try {
      const direction = await this._directionById(id);
      if (!direction.isActive) throw new AppError(404, "direction_not_found");

      await prisma.catalogDirection.update({
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

  async restoreDirection(id) {
    try {
      const direction = await this._directionById(id);
      if (direction.isActive) {
        throw new AppError(404, "direction_not_found");
      }

      await prisma.catalogDirection.update({
        where: { id },
        data: {
          deletedById: null,
          deletedAt: null,
          isActive: true,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async getDirectionTrash(query) {
    let { page, limit, key, sort, reverse } = query;
    page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    key = typeof key === "string" ? key.trim() : null;
    sort = ["titleUz", "createdAt", "deletedAt"].includes(sort) ? sort : "deletedAt";
    reverse = reverse !== "false";

    try {
      const whereArgs = { isActive: false };

      const count = await prisma.catalogDirection.count({ where: whereArgs });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.catalogDirection.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: whereArgs,
        include: {
          _count: {
            select: {
              catalogs: {
                where: { isActive: true },
              },
            },
          },
          image: {
            where: { isActive: true },
            select: { id: true, url: true, mimeType: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
          deletedBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
        },
      });
      return {
        data: data.map((d) => ({
          id: d.id,
          titleEn: d.titleEn,
          titleRu: d.titleRu,
          titleUz: d.titleUz,
          createdAt: d.createdAt,
          deletedAt: d.deletedAt,
          createdBy: d.createdBy,
          deletedBy: d.deletedBy,
          image: d.image,
        })),
        page,
        limit,
        sort,
        reverse,
        count,
        totalPage,
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteDirection(id) {
    try {
      const direction = await this._directionById(id);
      if (direction.isActive) throw new AppError(404, "direction_not_found");

      const filenames = [];

      const [directionAttachments, catalogs] = await Promise.all([
        prisma.attachment.findMany({
          where: { catalogDirectionId: id },
        }),
        prisma.catalog.findMany({
          where: { directionId: id },
          include: {
            attachments: {
              select: {
                filename: true,
              },
            },
          },
        }),
      ]);

      await prisma.catalogDirection.delete({
        where: { id },
      });

      if (directionAttachments.length) {
        for (const a of directionAttachments) {
          filenames.push(a.filename);
        }
      }

      if (catalogs.length) {
        for (const c of catalogs) {
          const attachents = c.attachments;
          for (const a of attachents) {
            filenames.push(a.filename);
          }
        }
      }

      if (filenames.length) {
        await storage.deleteMany(filenames);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async create({ createdById, data, file, files } = {}) {
    const uploadedFiles = [];
    let uploaded = null;

    if (file) {
      try {
        uploaded = await storage.save(file);
      } catch (error) {
        await fileService.unlinkFiles(file);
        await fileService.unlinkFiles(files);
        throw error;
      }
    }

    if (Array.isArray(files) && files.length > 0) {
      try {
        for (const file of files) {
          const uploaded = await storage.save(file);
          uploadedFiles.push(uploaded);
        }
      } catch (error) {
        await fileService.unlinkFiles(files);
        if (uploaded) {
          await storage.delete(uploaded.filename);
        }
        if (uploadedFiles.length > 0) {
          await storage.deleteMany(uploadedFiles.map((f) => f.filename));
        }
        throw error;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const { items, ...clearData } = data;

        if (data.directionId) {
          const direction = await tx.catalogDirection.findFirst({
            where: { id: data.directionId, isActive: true },
          });
          if (!direction) throw new AppError(404, "direction_not_found");
        }

        const catalog = await tx.catalog.create({
          data: {
            ...clearData,
            createdById,
          },
        });

        if (Array.isArray(items) && items.length > 0) {
          const preparedItems = [];

          for (const i of items) {
            let material = null;

            if (i.materialId) {
              material = await tx.catalogMaterial.findFirst({
                where: { id: i.materialId, isActive: true },
              });

              if (!material) {
                throw new AppError(404, "material_not_found");
              }
            } else {
              material = await this.createMaterial({
                tx,
                data: {
                  name: i.name,
                  parameter: i.parameter,
                  pricePerUnit: i.pricePerUnit,
                  unit: i.unit,
                },
                createdById,
              });
            }

            const totalPrice = BigInt(Math.round(Number(material.pricePerUnit) * Number(i.quantity)));

            preparedItems.push({
              materialId: material.id,
              quantity: i.quantity,
              totalPrice,
              catalogId: catalog.id,
              createdById,
            });
          }

          if (preparedItems.length > 0) {
            await tx.catalogItem.createMany({
              data: preparedItems,
            });
          }
        }

        if (uploaded) {
          await tx.attachment.create({
            data: {
              ...uploaded,
              previewCatalogId: catalog.id,
              createdById,
            },
          });
        }

        if (uploadedFiles.length > 0) {
          await tx.attachment.createMany({
            data: uploadedFiles.map((f) => ({
              ...f,
              catalogId: catalog.id,
              createdById,
            })),
          });
        }

        return;
      });
    } catch (error) {
      if (uploaded) {
        await storage.delete(uploaded.filename);
      }
      if (uploadedFiles.length > 0) {
        await storage.delete(uploadedFiles.map((f) => f.filename));
      }
      throw error;
    }

    return;
  }

  async getList(query) {
    try {
      let { page, limit, sort, reverse, key, directionId } = query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;
      sort = ["createdAt", "titleUz", "updatedAt", "amount", "sku"].includes(sort) ? sort : "createdAt";
      reverse = reverse !== "false";
      directionId = !Number.isNaN(Number(directionId)) && Number(directionId) > 0 && Number.isInteger(Number(directionId)) ? Number(directionId) : null;

      let direction = null;
      if (directionId) {
        direction = await prisma.catalogDirection.findFirst({
          where: { id: directionId, isActive: true },
          select: {
            id: true,
            titleUz: true,
          },
        });
        if (!direction) {
          throw new AppError(404, "direction_not_found");
        }
      }

      const findArgs = {
        isActive: true,
        ...(directionId && { directionId }),
        ...(key && {
          OR: [
            { titleUz: { contains: key, mode: "insensitive" } },
            { titleRu: { contains: key, mode: "insensitive" } },
            { titleEn: { contains: key, mode: "insensitive" } },
            { sku: { contains: key, mode: "insensitive" } },
            { parameter: { contains: key, mode: "insensitive" } },
          ],
        }),
      };

      const count = await prisma.catalog.count({
        where: findArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [catalogs, agg] = await Promise.all([
        prisma.catalog.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findArgs,
          include: {
            previewImage: {
              where: { isActive: true },
              select: { mimeType: true, url: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            _count: {
              select: {
                items: {
                  where: { isActive: true },
                },
              },
            },
            items: {
              where: { isActive: true },
              select: {
                totalPrice: true,
              },
            },
          },
        }),
        prisma.catalog.aggregate({
          _count: { _all: true },
          where: {
            ...(directionId && { directionId }),
            isActive: true,
          },
        }),
      ]);

      const totalAmount = catalogs.reduce((cSum, c) => cSum + c.items.reduce((iSum, i) => iSum + (i.totalPrice || 0n), 0n), 0n);

      return {
        page,
        limit,
        reverse,
        sort,
        totalPage,
        totalCount: agg._count._all,
        totalAmount,
        direction,
        data: catalogs.map((c) => ({
          id: c.id,
          titleUz: c.titleUz,
          titleRu: c.titleRu,
          titleEn: c.titleEn,
          isVisible: c.isVisible,
          sku: c.sku,
          amount: c.items.reduce((iSum, i) => iSum + (i.totalPrice || 0n), 0n) || 0,
          price: c.price,
          itemsCount: c._count.items,
          image: c.previewImage[0] || null,
          createdBy: c.createdBy,
          createdAt: c.createdAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicList(query) {
    try {
      let { page, limit, directionId } = query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 10;
      directionId = !Number.isNaN(Number(directionId)) && Number(directionId) > 0 && Number.isInteger(Number(directionId)) ? Number(directionId) : null;

      if (directionId) {
        const direction = await prisma.catalogDirection.findFirst({
          where: { id: directionId, isActive: true },
          select: { id: true },
        });
        if (!direction) {
          directionId = null;
        }
      }

      const findArgs = {
        isActive: true,
        isVisible: true,
        ...(directionId && { directionId }),
      };

      const count = await prisma.catalog.count({
        where: findArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const catalogs = await prisma.catalog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findArgs,
        include: {
          previewImage: {
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
        directionId,
        data: catalogs.map((c) => ({
          id: c.id,
          titleUz: c.titleUz,
          titleRu: c.titleRu,
          titleEn: c.titleEn,
          descUz: c.descUz,
          descRu: c.descRu,
          descEn: c.descEn,
          price: c.price,
          image: c.previewImage[0]?.url || null,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { id, isActive: true },
        include: {
          attachments: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
          previewImage: {
            where: { isActive: true },
            select: { id: true, mimeType: true, url: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
          items: {
            where: { isActive: true },
            include: {
              material: true,
            },
          },
        },
      });
      if (!catalog) throw new AppError(404, "catalog_not_found");

      return {
        data: {
          id: catalog.id,
          titleUz: catalog.titleUz,
          titleRu: catalog.titleRu,
          titleEn: catalog.titleEn,
          descUz: catalog.descUz,
          descRu: catalog.descRu,
          descEn: catalog.descEn,
          sku: catalog.sku,
          isVisible: catalog.isVisible,
          amount: catalog.items.reduce((sum, i) => sum + i.totalPrice, 0n) || 0n,
          price: catalog.price,
          parameter: catalog.parameter,
          createdAt: catalog.createdAt,
          createdBy: catalog.createdBy,
          items: catalog.items.map((i) => ({
            id: i.id,
            totalPrice: i.totalPrice,
            createdAt: i.createdAt,
            unit: i.material.unit,
            name: i.material.name,
            parameter: i.material.parameter,
            pricePerUnit: i.material.pricePerUnit,
            quantity: i.quantity,
          })),
          images: catalog.attachments,
          image: catalog.previewImage[0] || null,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async getPublicById(id) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { id, isActive: true },
        include: {
          direction: {
            where: { isActive: true },
            select: {
              id: true,
              titleEn: true,
              titleRu: true,
              titleUz: true,
            },
          },
          attachments: {
            where: { isActive: true },
            select: { url: true },
          },
        },
      });
      if (!catalog) throw new AppError(404, "catalog_not_found");

      return {
        data: {
          id: catalog.id,
          titleUz: catalog.titleUz,
          titleRu: catalog.titleRu,
          titleEn: catalog.titleEn,
          descUz: catalog.descUz,
          descRu: catalog.descRu,
          descEn: catalog.descEn,
          price: catalog.price,
          images: catalog.attachments.map((a) => a.url),
          parameter: catalog.parameter,
          direction: catalog.direction,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async update({ id, createdById, data, file, files } = {}) {
    let uploadedFile = null;
    const uploadedFiles = [];
    const prevImagesForDelete = [];

    if (file) {
      try {
        uploadedFile = await storage.save(file);
      } catch (error) {
        await fileService.unlinkFiles(file);
        await fileService.unlinkFiles(files);
        throw error;
      }
    }

    if (Array.isArray(files) && files.length > 0) {
      try {
        for (const file of files) {
          const uploaded = await storage.save(file);
          uploadedFiles.push(uploaded);
        }
      } catch (error) {
        await fileService.unlinkFiles(files);
        if (uploadedFile) {
          await storage.delete(uploadedFile.filename);
        }
        if (uploadedFiles.length > 0) {
          await storage.deleteMany(uploadedFiles.map((f) => f.filename));
        }
        throw error;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const catalog = await prisma.catalog.findFirst({
          where: { id, isActive: true },
          include: {
            previewImage: true,
          },
        });
        if (!catalog) throw new AppError(404, "catalog_not_found");

        await prisma.catalog.update({
          where: { id },
          data,
        });

        if (uploadedFile) {
          if (catalog.previewImage.length) {
            for (const prev of catalog.previewImage) {
              prevImagesForDelete.push(prev);
            }
            await tx.attachment.deleteMany({
              where: { id: { in: catalog.previewImage.map((a) => a.id) } },
            });
          }

          await tx.attachment.create({
            data: {
              ...uploadedFile,
              previewCatalogId: id,
              createdById,
            },
          });
        }

        if (uploadedFiles.length > 0) {
          await tx.attachment.createMany({
            data: uploadedFiles.map((i) => ({
              ...i,
              catalogId: id,
              createdById,
            })),
          });
        }

        return;
      });
    } catch (error) {
      if (uploadedFile) {
        await storage.delete(uploadedFile.filename);
      }
      if (uploadedFiles.length) {
        await storage.deleteMany(uploadedFiles.map((f) => f.filename));
      }
      throw error;
    }

    if (prevImagesForDelete.length) {
      await storage.deleteMany(prevImagesForDelete.map((f) => f.filename));
    }

    return;
  }

  async softDelete(id, deletedById) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { id, isActive: true },
      });
      if (!catalog) throw new AppError(404, "catalog_not_found");

      await prisma.catalog.update({
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

  async restore(id) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { id, isActive: false },
      });
      if (!catalog) throw new AppError(404, "catalog_not_found");

      await prisma.catalog.update({
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
      const catalog = await prisma.catalog.findFirst({
        where: { id, isActive: false },
        include: { attachments: true },
      });
      if (!catalog) throw new AppError(404, "catalog_not_found");

      await prisma.catalog.delete({
        where: { id },
      });

      if (catalog.attachments.length) {
        const filenames = catalog.attachments.map((a) => a.filename);
        await storage.deleteMany(filenames);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async createItem({ catalogId, createdById, data } = {}) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { id: catalogId, isActive: true },
      });
      if (!catalog) throw new AppError(404, "catalog_not_found");

      await prisma.$transaction(async (tx) => {
        let material = null;

        if (data.materialId) {
          material = await tx.catalogMaterial.findFirst({
            where: { id: data.materialId, isActive: true },
          });

          if (!material) {
            throw new AppError(404, "material_not_found");
          }
        } else {
          material = await this.createMaterial({
            data: {
              name: data.name,
              parameter: data.parameter,
              pricePerUnit: data.pricePerUnit,
              unit: data.unit,
            },
            tx,
            createdById,
          });
        }

        const totalPrice = BigInt(Math.round(Number(material.pricePerUnit) * Number(data.quantity)));

        await tx.catalogItem.create({
          data: {
            catalogId,
            materialId: material.id,
            quantity: data.quantity,
            totalPrice,
            createdById,
          },
        });

        return;
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async updateItem({ catalogItemId, data, createdById }) {
    try {
      const catalogItem = await prisma.catalogItem.findFirst({
        where: {
          id: catalogItemId,
          isActive: true,
          catalog: { isActive: true },
        },
      });
      if (!catalogItem) throw new AppError(404, "resource_not_found");

      await prisma.$transaction(async (tx) => {
        let material = null;

        if (data.materialId) {
          material = await tx.catalogMaterial.findFirst({
            where: { id: data.materialId, isActive: true },
          });

          if (!material) {
            throw new AppError(404, "material_not_found");
          }
        } else {
          material = await this.createMaterial({
            data: {
              name: data.name,
              parameter: data.parameter,
              pricePerUnit: data.pricePerUnit,
              unit: data.unit,
            },
            tx,
            createdById,
          });
        }

        const totalPrice = BigInt(Math.round(Number(material.pricePerUnit) * Number(data.quantity)));

        await tx.catalogItem.update({
          where: { id: catalogItemId },
          data: {
            materialId: material.id,
            quantity: data.quantity,
            totalPrice,
          },
        });

        return;
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async softDeleteItem(id, deletedById) {
    try {
      const catalogItem = await prisma.catalogItem.findFirst({
        where: { id, isActive: true },
      });
      if (!catalogItem) throw new AppError(404, "resource_not_found");

      await prisma.catalogItem.update({
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

  async restoreMaterial(id) {
    try {
      const catalogMaterial = await prisma.catalogMaterial.findFirst({
        where: { id, isActive: false },
      });
      if (!catalogMaterial) throw new AppError(404, "resource_not_found");

      await prisma.catalogMaterial.update({
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

  async deleteMaterial(id) {
    try {
      const catalogMaterial = await prisma.catalogMaterial.findFirst({
        where: { id, isActive: false },
      });
      if (!catalogMaterial) throw new AppError(404, "resource_not_found");

      await prisma.catalogMaterial.delete({
        where: { id },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async createMaterial({ data, createdById, tx }) {
    try {
      let material = null;
      if (tx) {
        const condidat = await tx.catalogMaterial.findFirst({
          where: { isActive: true, name: data.name },
        });
        if (condidat) {
          throw new AppError(400, "already_exists_material_with_this_name");
        }

        material = await tx.catalogMaterial.create({
          data: {
            ...data,
            createdById,
          },
        });
      } else {
        const condidat = await prisma.catalogMaterial.findFirst({
          where: { isActive: true, name: data.name },
        });
        if (condidat) {
          throw new AppError(400, "already_exists_material_with_this_name");
        }

        material = await prisma.catalogMaterial.create({
          data: {
            ...data,
            createdById,
          },
        });
      }

      return material;
    } catch (error) {
      throw error;
    }
  }

  async getMaterialsList(query) {
    let { page, limit, key, sortBy, reverse } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse = reverse !== "false";
    key = typeof key === "string" ? key.trim() : null;
    sortBy = ["createdAt", "updatedAt", "name", "pricePerUnit"].includes(sortBy) ? sortBy : "createdAt";

    const argsWhere = {
      isActive: true,
      ...(key && {
        OR: [
          {
            name: { contains: key, mode: "insensitive" },
          },
          {
            parameter: { contains: key, mode: "insensitive" },
          },
        ],
      }),
    };

    try {
      const count = await prisma.catalogMaterial.count({
        where: argsWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const materials = await prisma.catalogMaterial.findMany({
        orderBy: { [sortBy]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: argsWhere,
        include: {
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
        data: materials.map((m) => ({
          id: m.id,
          name: m.name,
          parameter: m.parameter,
          unit: m.unit,
          pricePerUnit: m.pricePerUnit,
          createdBy: m.createdBy,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async searchMaterial(query) {
    let { key } = query;
    key = typeof key === "string" ? key.trim() : null;

    const argsWhere = {
      isActive: true,
      ...(key && {
        OR: [
          {
            name: { contains: key, mode: "insensitive" },
          },
          {
            parameter: { contains: key, mode: "insensitive" },
          },
        ],
      }),
    };

    try {
      const materials = await prisma.catalogMaterial.findMany({
        orderBy: { name: "asc" },
        where: argsWhere,
        select: {
          id: true,
          name: true,
          parameter: true,
          unit: true,
          pricePerUnit: true,
        },
      });

      return materials;
    } catch (error) {
      throw error;
    }
  }

  async getMaterialById(id) {
    try {
      const material = await prisma.catalogMaterial.findFirst({
        where: { id, isActive: true },
        include: {
          createdBy: {
            where: { isActive: true },
            select: { fname: true, lname: true },
          },
        },
      });
      if (!material) {
        throw new AppError(404, "material_not_found");
      }

      return {
        id: material.id,
        name: material.name,
        parameter: material.parameter,
        pricePerUnit: material.pricePerUnit,
        unit: material.unit,
        createdAt: material.createdAt,
        updatedAt: material.updatedAt,
        createdBy: material.createdBy,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateMaterial({ id, data } = {}) {
    try {
      const material = await prisma.catalogMaterial.findFirst({
        where: { id: id, isActive: true },
        include: {
          catalogItems: true,
        },
      });
      if (!material) {
        throw new AppError(404, "material_not_found");
      }

      if (data.name !== material.name) {
        const condidat = await prisma.catalogMaterial.findFirst({
          where: { isActive: true, name: data.name },
        });
        if (condidat) {
          throw new AppError(400, "already_exist_material_with_this_name");
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.catalogMaterial.update({
          where: { id },
          data,
        });

        if (material.catalogItems.length > 0) {
          for (const i of material.catalogItems) {
            const totalPrice = BigInt(Math.round(Number(data.pricePerUnit) * Number(i.quantity)));

            await tx.catalogItem.update({
              where: { id: i.id },
              data: { totalPrice },
            });
          }
        }

        return;
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async softDeleteMaterial({ id, deletedById } = {}) {
    try {
      const material = await prisma.catalogMaterial.findFirst({
        where: { id: id, isActive: true },
        include: {
          catalogItems: true,
        },
      });
      if (!material) {
        throw new AppError(404, "material_not_found");
      }

      await prisma.catalogMaterial.update({
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

  async getCatalogTrash(query) {
    try {
      let { page, limit, sort, reverse, key } = query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;
      sort = ["createdAt", "titleUz", "updatedAt", "amount", "sku"].includes(sort) ? sort : "createdAt";
      reverse = reverse !== "false";

      const findArgs = {
        isActive: false,
        ...(key && {
          OR: [
            {
              titleUz: { contains: key, mode: "insensitive" },
            },
            {
              titleRu: { contains: key, mode: "insensitive" },
            },
            {
              titleEn: { contains: key, mode: "insensitive" },
            },
            {
              sku: { contains: key, mode: "insensitive" },
            },
          ],
        }),
      };

      const count = await prisma.catalog.count({
        where: findArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [catalogs, agg] = await Promise.all([
        prisma.catalog.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findArgs,
          include: {
            attachments: { where: { isActive: true } },
            createdBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            deletedBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            _count: {
              select: {
                items: {
                  where: { isActive: true },
                },
              },
            },
          },
        }),
        prisma.catalog.aggregate({
          _count: { _all: true },
          where: { isActive: false },
        }),
      ]);

      return {
        page,
        limit,
        reverse,
        sort,
        totalPage,
        totalCount: agg._count._all,
        data: catalogs.map((c) => ({
          id: c.id,
          titleUz: c.titleUz,
          titleRu: c.titleRu,
          titleEn: c.titleEn,
          sku: c.sku,
          itemsCount: c._count.items,
          images: c.attachments.map((a) => ({ url: a.url, mimeType: a.mimeType })),
          createdBy: c.createdBy || null,
          deletedBy: c.deletedBy || null,
          createdAt: c.createdAt,
          deletedAt: c.deletedAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getCatalogMaterialTrash(query) {
    try {
      let { page, limit } = query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;

      const findArgs = {
        isActive: false,
      };

      const count = await prisma.catalogMaterial.count({
        where: findArgs,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [materials, agg] = await Promise.all([
        prisma.catalogMaterial.findMany({
          orderBy: { deletedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findArgs,
          include: {
            createdBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            deletedBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
          },
        }),
        prisma.catalogMaterial.aggregate({
          _count: { _all: true },
          where: { isActive: false },
        }),
      ]);

      return {
        page,
        limit,
        totalPage,
        totalCount: agg._count._all,
        data: materials.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          deletedBy: m.deletedBy,
          deletedAt: m.deletedAt,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  _formatNumber(num) {
    if (typeof num === "bigint" && num !== 0n) {
      num = Number(num) / 100;
    }
    return Number(num) /* .toLocaleString("uz-UZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) */;
  }

  async getExcel(query) {
    try {
      let { sort, reverse } = query;

      sort = ["createdAt", "name", "updatedAt", "amount", "sku"].includes(sort) ? sort : "createdAt";
      reverse = reverse !== "false";

      const [catalogs, agg] = await Promise.all([
        prisma.catalog.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          where: { isActive: true },
          include: {
            attachments: { where: { isActive: true } },
            createdBy: { where: { isActive: true } },
            _count: {
              select: {
                items: {
                  where: { isActive: true },
                },
              },
            },
          },
        }),
        prisma.catalog.aggregate({
          _sum: { amount: true },
          _count: { _all: true },
          where: { isActive: true },
        }),
      ]);

      const data = {
        totalCount: agg._count._all,
        totalAmount: agg._sum.amount || 0,
        catalogs: catalogs.map((c) => ({
          id: c.id,
          name: c.name,
          sku: c.sku,
          amount: c.amount,
          itemsCount: c._count.items,
          images: c.attachments.map((a) => ({ url: a.url, mimeType: a.mimeType })),
          createdBy: c.createdBy
            ? {
                fname: c.createdBy.fname,
                lname: c.createdBy.lname,
              }
            : null,
          createdAt: c.createdAt,
        })),
      };

      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Catalogs");

      // Ustunlar
      sheet.columns = [
        {
          header: "№",
          key: "number",
          width: 8,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Ресурс номи",
          key: "name",
          width: 35,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Сана",
          key: "createdAt",
          width: 22,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Нархи",
          key: "amount",
          width: 18,
          style: {
            alignment: { horizontal: "right", vertical: "middle" },
            numFmt: "#,##0.00",
          },
        },
        {
          header: "Маҳсулот ИД",
          key: "sku",
          width: 25,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Яратган фойдаланувчи",
          key: "createdBy",
          width: 30,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
      ];

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const hour = d.getHours().toString();
        const minutes = d.getMinutes();
        return `${day}.${month}.${d.getFullYear()} ${hour}:${minutes}`;
      };

      // Ma'lumotlarni qo‘shish
      data.catalogs.forEach((item, index) => {
        sheet.addRow({
          number: index + 1,
          name: item.name,
          createdAt: formatDate(item.createdAt),
          amount: this._formatNumber(item.amount),
          sku: item.sku || "",
          createdBy: item.createdBy ? `${item.createdBy.fname} ${item.createdBy.lname}` : "",
        });
      });

      // Header stili
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;

      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Qatorlarga border berish
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      // JAMI qatori
      const summaryRow = sheet.addRow({});
      sheet.addRow({
        name: "Умумий маҳсулотлар сони:",
        amount: data.totalCount,
      }).font = { bold: true };

      sheet.addRow({
        name: "Умумий сумма:",
        amount: this._formatNumber(data.totalAmount),
      }).font = { bold: true };

      sheet.views = [{ state: "frozen", ySplit: 1 }];

      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      throw error;
    }
  }

  async getItemExcel(id) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { id, isActive: true },
        include: {
          items: { where: { isActive: true } },
        },
      });

      if (!catalog) throw new AppError(404, "catalog_not_found");

      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Catalog Items");

      // ===== USTUNLAR =====
      sheet.columns = [
        { header: "№", key: "number", width: 8, style: { alignment: { horizontal: "center", vertical: "middle" } } },
        { header: "Материал номи", key: "name", width: 35, style: { alignment: { horizontal: "center", vertical: "middle" } } },
        { header: "Техник параметри", key: "parameter", width: 25, style: { alignment: { horizontal: "center", vertical: "middle" } } },
        { header: "Ўлчов бирлиги", key: "unit", width: 18, style: { alignment: { horizontal: "center", vertical: "middle" } } },
        { header: "Миқдори", key: "quantity", width: 14, style: { alignment: { horizontal: "center", vertical: "middle" } } },
        {
          header: "Бирлик нархи",
          key: "pricePerUnit",
          width: 18,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
        {
          header: "Умумий нархи",
          key: "totalPrice",
          width: 20,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
      ];

      // ===== MA'LUMOTLARNI QO‘SHISH =====
      catalog.items.forEach((item, index) => {
        let unitUz = null;

        switch (item.unit) {
          case Unit.KG:
            unitUz = "Килограмм";
            break;
          case Unit.M:
            unitUz = "Метр";
            break;
          case Unit.M2:
            unitUz = "Квадрат метр";
            break;
          case Unit.M3:
            unitUz = "Куб метр";
            break;
          case Unit.PCS:
            unitUz = "Дона";
            break;
          case Unit.SET:
            unitUz = "Тўплам";
            break;
          case Unit.TON:
            unitUz = "Tonna";
            break;
          case Unit.L:
            unitUz = "Литр";
            break;
          case Unit.UZS:
            unitUz = "Сўм";
            break;
          case Unit.H:
            unitUz = "Соат";
            break;
          case Unit.DAY:
            unitUz = "Кун";
            break;
          case Unit.WORK_VOLUME:
            unitUz = "Иш ҳажми";
            break;
          case Unit.SERVICE:
            unitUz = "Хизмат";
            break;
          default:
            unitUz = "Дона";
            break;
        }

        sheet.addRow({
          number: index + 1,
          name: item.name,
          unit: unitUz || "",
          quantity: Number(item.quantity),
          pricePerUnit: this._formatNumber(item.pricePerUnit),
          totalPrice: this._formatNumber(item.totalPrice),
          parameter: item.parameter || "",
        });
      });

      // ===== HEADER STILI =====
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;

      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // ===== BORDERLAR =====
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      // ===== JAMI QATOR =====
      sheet.addRow({});

      const totalQuantity = catalog.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

      const totalSum = catalog.items.reduce((sum, i) => sum + (i.totalPrice || 0n), 0n);

      sheet.addRow({
        name: "Жами миқдор:",
        quantity: totalQuantity,
      }).font = { bold: true };

      sheet.addRow({
        name: "Умумий сумма:",
        totalPrice: this._formatNumber(totalSum),
      }).font = { bold: true };

      sheet.views = [{ state: "frozen", ySplit: 1 }];

      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      throw error;
    }
  }

  async deleteGalleryItem(id) {
    try {
      const gallery = await prisma.attachment.findFirst({
        where: { isActive: true, id, catalogId: { not: null } },
      });
      if (!gallery) {
        throw new AppError(404, "image_not_found");
      }

      await prisma.attachment.delete({
        where: { id },
      });

      await storage.delete(gallery.filename);

      return;
    } catch (error) {
      throw error;
    }
  }

  async createOrder({ catalogId, data } = {}) {
    try {
      const catalog = await prisma.catalog.findFirst({
        where: { isActive: true, id: catalogId },
      });
      if (!catalog) {
        throw new AppError(404, "product_not_found");
      }

      await prisma.inbox.create({
        data: {
          ...data,
          catalogId,
          type: "ORDER_PRODUCT",
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
}

module.exports = new catalogService();
