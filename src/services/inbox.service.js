const AppError = require("../utils/AppError");
const prisma = require("./prisma");

class inboxService {
  async getList({ query, userId, userRole } = {}) {
    let { page, limit, sortBy, reverse, type, status } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    sortBy = ["createdAt", "phone", "name"].includes(sortBy) ? sortBy : "createdAt";
    reverse = reverse === "true";
    type = ["ORDER_PRODUCT", "ORDER_SERVICE", "CONTACT"].includes(type) ? type : null;
    status = ["PENDING", "WORKING", "COMPLETED", "CANCELED"].includes(status) ? status : null;

    const argsWhere = {
      isActive: true,
      ...(type && { type }),
      ...(status && { status }),
    };

    try {
      const count = await prisma.inbox.count({
        where: argsWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [inboxes, groupedType, groupedStatus] = await Promise.all([
        prisma.inbox.findMany({
          orderBy: { [sortBy]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: argsWhere,
          include: {
            readUsers: {
              where: { isActive: true },
              select: { id: true },
            },
          },
        }),
        prisma.inbox.groupBy({
          by: ["type"],
          _count: true,
          where: { isActive: true },
        }),
        prisma.inbox.groupBy({
          by: ["status"],
          _count: true,
          where: { isActive: true },
        }),
      ]);

      const typeCount = {
        ORDER_PRODUCT: 0,
        ORDER_SERVICE: 0,
        CONTACT: 0,
      };
      for (const g of groupedType) {
        typeCount[g.type] = g._count || 0;
      }

      const statusCount = {
        PENDING: 0,
        WORKING: 0,
        COMPLETED: 0,
        CANCELED: 0,
      };
      for (const g of groupedStatus) {
        statusCount[g.status] = g._count || 0;
      }

      return {
        page,
        limit,
        sortBy,
        totalPage,
        count,
        typeCount,
        statusCount,
        data: inboxes.map((i) => ({
          id: i.id,
          type: i.type,
          status: i.status,
          name: i.name,
          company: i.company,
          phone: i.phone,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          ...(userRole === "SUPERADMIN" && {
            readUsersCount: i.readUsers.length,
          }),
          isRead: i.readUsers.find((u) => u.id === userId),
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async getById({ id, user } = {}) {
    try {
      const data = await prisma.$transaction(async (tx) => {
        const inbox = await tx.inbox.findFirst({
          where: { isActive: true, id },
          include: {
            catalog: {
              where: { isActive: true },
              select: {
                id: true,
                titleUz: true,
              },
            },
            service: {
              where: { isActive: true },
              select: {
                id: true,
                titleUz: true,
              },
            },
            readUsers: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
              },
            },
          },
        });
        if (!inbox) {
          throw new AppError(404, "inbox_not_found");
        }

        const isRead = inbox.readUsers.some((u) => u.id === user.id);
        if (!isRead) {
          await tx.inbox.update({
            where: { id },
            data: {
              readUsers: {
                connect: {
                  id: user.id,
                },
              },
            },
          });

          if (user.role === "SUPERADMIN") {
            inbox.readUsers.push({
              id: user.id,
              fname: user.fname,
              lname: user.lname,
            });
          }
        }

        return Object.fromEntries(Object.entries(inbox).filter(([_, value]) => value !== null));
      });

      return {
        id: data.id,
        catalog: data.catalog,
        company: data.company,
        createdAt: data.createdAt,
        message: data.message,
        name: data.name,
        phone: data.phone,
        service: data.service,
        status: data.status,
        type: data.type,
        updatedAt: data.updatedAt,
        ...(user.role === "SUPERADMIN" && {
          readUsers: data.readUsers,
        }),
      };
    } catch (error) {
      throw error;
    }
  }

  async changeStatus({ id, data } = {}) {
    try {
      const inbox = await prisma.inbox.findFirst({
        where: { id, isActive: true },
      });
      if (!inbox) {
        throw new AppError(404, "inbox_not_found");
      }

      await prisma.inbox.update({
        where: { id },
        data,
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async softDelete({ id, deletedById } = {}) {
    try {
      const inbox = await prisma.inbox.findFirst({
        where: { id, isActive: true },
      });
      if (!inbox) {
        throw new AppError(404, "inbox_not_found");
      }

      await prisma.inbox.update({
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

  async getTrash({ query } = {}) {
    let { page, limit } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? page : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? limit : 30;

    try {
      const count = await prisma.inbox.count({
        where: { isActive: false },
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.inbox.findMany({
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
        totalPage: true,
        data: data.map((d) => ({
          id: d.id,
          createdAt: d.createdAt,
          deletedAt: d.deletedAt,
          name: d.name,
          phone: d.phone,
          status: d.status,
          type: d.type,
          deletedBy: d.deletedBy,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  async restore({ id }) {
    try {
      const data = await prisma.inbox.findFirst({
        where: { isActive: false, id },
      });
      if (!data) {
        throw new AppError(404, "inbox_not_found");
      }

      await prisma.inbox.update({
        where: { id },
        data: {
          isActive: true,
          deletedAt: null,
          deletedById: null,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async delete({ id }) {
    try {
      const data = await prisma.inbox.findFirst({
        where: { isActive: false, id },
      });
      if (!data) {
        throw new AppError(404, "inbox_not_found");
      }

      await prisma.inbox.delete({
        where: { id },
      });

      return;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new inboxService();
