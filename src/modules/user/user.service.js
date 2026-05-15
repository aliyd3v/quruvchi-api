const { hashPassword } = require("../../utils/bcrypt");
const { TransactionType, Role } = require("../../generated/prisma");
const prisma = require("../../lib/prisma");
const AppError = require("../../utils/AppError");
const SMS = require("../../utils/sms");
const { deleteFileFromS3 } = require("../../utils/s3");

const allowedColumnKeys = ["fname", "lname", "phone", "email", "role", "lastSeans", "createdAt", "deletedAt"];
const allowedColumnKeysForGetUsersWithBalance = ["fname", "lname", "phone", "email", "balance", "role", "lastSeans", "createdAt"];

class UserService {
  async create({ data, createdById } = {}) {
    const { password } = data;

    try {
      const passwordHash = await hashPassword(password);

      const condidatPhone = await prisma.user.findUnique({
        where: { phone },
      });

      if (condidatPhone) {
        if (!condidatPhone.isActive) {
          throw new AppError(400, "phone_already_taken_and_but_that_user_disabled");
        } else {
          throw new AppError(400, "phone_already_taken");
        }
      }

      const condidatEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (condidatEmail) {
        if (!condidatEmail.isActive) {
          throw new AppError(400, "email_already_taken_and_but_that_user_disabled");
        } else {
          throw new AppError(400, "email_already_taken");
        }
      }

      data.password = passwordHash;
      data.createdById = createdById;

      await prisma.user.create({
        data,
      });

      await SMS.send(
        `+998${data.phone}`,
        `Rsq.uz Hurmatli ${data.fname + " " + data.lname} siz uchun profil yaratildi. Login: +998${phone} Pochta: ${data.email} Parol: ${password} Tizimga kirish uchun: rsq.uz/kabinet`,
      );

      return;
    } catch (error) {
      throw error;
    }
  }

  async getList(query) {
    let { page, limit, role, sort, reverse, key } = query;

    key = typeof key === "string" ? key.trim() : "";
    page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse = reverse === "true";
    sort = allowedColumnKeys.includes(sort) ? sort : "fname";
    role = [Role.ACCOUNTANT, Role.ADMIN, Role.PTO, Role.WORKER].includes(role) ? role : null;

    const findWhere = {
      isActive: true,
      ...(role ? { role } : { role: { not: "SUPERADMIN" } }),
      ...(key && {
        OR: [
          { fname: { contains: key, mode: "insensitive" } },
          { lname: { contains: key, mode: "insensitive" } },
          { email: { contains: key, mode: "insensitive" } },
          { phone: { contains: key, mode: "insensitive" } },
        ],
      }),
    };

    try {
      const count = await prisma.user.count({
        where: findWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [users, counts, totalHaveTask] = await Promise.all([
        prisma.user.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          include: {
            avatar: { select: { url: true } },
            tasks: {
              where: {
                task: {
                  isActive: true,
                  startDate: { lte: new Date() },
                  endDate: { gte: new Date() },
                },
              },
              take: 1,
              select: { id: true },
            },
            objects: { where: { isActive: true } },
            createdBy: {
              where: { isActive: true },
              select: { id: true, lname: true, fname: true },
            },
          },
        }),
        prisma.user.groupBy({
          by: ["isActive"],
          _count: true,
          where: { role: { not: "SUPERADMIN" } },
        }),
        prisma.user.count({
          where: {
            role: { not: "SUPERADMIN" },
            isActive: true,
            tasks: {
              some: {
                task: {
                  startDate: { lte: new Date() },
                  endDate: { gte: new Date() },
                  isActive: true,
                },
              },
            },
          },
        }),
      ]);

      const totals = {
        TOTAL: 0,
        ACTIVE: 0,
        HAVE_TASK: 0,
        DELETED: 0,
      };
      totals.TOTAL = counts.find((g) => !!g.isActive)?._count || 0;
      totals.DELETED = counts.find((g) => !g.isActive)?._count || 0;
      totals.HAVE_TASK = totalHaveTask || 0;
      totals.ACTIVE = totals.TOTAL - totalHaveTask || 0;

      const result = users.map((u) => ({
        id: u.id,
        fname: u.fname,
        lname: u.lname,
        phone: u.phone,
        email: u.email,
        role: u.role,
        birthday: u.birthday,
        blockedUntil: u.blockedUntil,
        lastSeans: u.lastSeans,
        avatar: u.avatar ? { url: u.avatar.url } : null,
        createdAt: u.createdAt,
        status: u.tasks.length ? "NOT_ACTIVE" : "ACTIVE",
        objects: u.objects.map((o) => ({ id: o.id, name: o.name })),
        createdBy: u.createdBy ? { id: u.createdBy.id, fname: u.createdBy.fname, lname: u.createdBy.lname } : null,
      }));

      return {
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        totals,
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id) {
    try {
      const data = await prisma.user.findFirst({
        where: { id, role: { not: "SUPERADMIN" }, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          permissions: true,
          birthday: true,
        },
      });
      if (!data) throw new AppError(404, "user_not_found");

      return data;
    } catch (error) {
      throw error;
    }
  }

  async update({ id, data }) {
    try {
      await this.getById(id);

      await prisma.user.update({
        where: { id },
        data,
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async softDelete({ id, deletedById }) {
    try {
      await this.getById(id);

      await prisma.user.update({
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

  async trashList(query) {
    let { page, limit, sort, reverse, key } = query;

    key = typeof key === "string" ? key.trim() : null;
    page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse = reverse !== "false";
    sort = allowedColumnKeys.includes(sort) ? sort : "deletedAt";

    const findWhere = {
      isActive: false,
      role: { not: "SUPERADMIN" },
      ...(key && {
        OR: [
          { fname: { contains: key, mode: "insensitive" } },
          { lname: { contains: key, mode: "insensitive" } },
          { email: { contains: key, mode: "insensitive" } },
          { phone: { contains: key, mode: "insensitive" } },
        ],
      }),
    };

    try {
      const count = await prisma.user.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          updatedAt: true,
          deletedAt: true,
          deletedBy: {
            select: {
              fname: true,
              lname: true,
              role: true,
            },
          },
        },
      });

      return {
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  async restore(id) {
    try {
      const data = await prisma.user.findFirst({
        where: { id, isActive: false },
      });
      if (!data) {
        throw new AppError(404, "user_not_found");
      }

      await prisma.user.update({
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
      const data = await prisma.user.findFirst({
        where: { isActive: false, id },
        include: { avatar: true },
      });
      if (!data) throw new AppError(404, "user_not_found");

      await prisma.user.delete({
        where: { id },
      });

      if (data.avatar) {
        await deleteFileFromS3(data.avatar.filename);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  _setBlockPeriod(period) {
    switch (period) {
      case "1d":
        return new Date(Date.now() + 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      case "1m":
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      default:
        return 0;
    }
  }

  async block(id) {
    try {
      this.getById(id);

      const blockedUntil = setBlockPeriod(req.body.period);

      await prisma.user.update({
        where: { id },
        data: { blockedUntil },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async removeBlock(id) {
    try {
      this.getById(id);

      await prisma.user.update({
        where: { id },
        data: { blockedUntil: null },
      });

      return;
    } catch (error) {
      throw err;
    }
  }

  async search(key) {
    const argsWhere = {
      role: { not: "SUPERADMIN" },
      isActive: true,
      ...(key && {
        OR: [
          {
            fname: { contains: key, mode: "insensitive" },
          },
          {
            lname: { contains: key, mode: "insensitive" },
          },
          {
            email: { contains: key, mode: "insensitive" },
          },
        ],
      }),
    };

    try {
      const data = await prisma.user.findMany({
        orderBy: { fname: "asc" },
        where: argsWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          avatar: { select: { url: true } },
        },
      });

      return data;
    } catch (error) {
      throw error;
    }
  }

  async searchTrash(query) {
    let { page, limit, sort, reverse, key } = query;

    key = typeof key === "string" ? key.trim() : null;
    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse = reverse === "true";
    sort = allowedColumnKeys.includes(sort) ? sort : "fname";

    const findWhere = {
      role: { not: Role.SUPERADMIN },
      isActive: false,
      ...(key && {
        OR: [
          { fname: { contains: key, mode: "insensitive" } },
          { lname: { contains: key, mode: "insensitive" } },
          { email: { contains: key, mode: "insensitive" } },
          { phone: { contains: key, mode: "insensitive" } },
        ],
      }),
    };

    try {
      const count = await prisma.user.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          objects: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          blockedUntil: true,
          permissions: true,
          lastSeans: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              avatar: true,
              role: true,
            },
          },
          deletedBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              avatar: true,
              role: true,
            },
          },
        },
      });

      return {
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  async getSortedByRole(key) {
    try {
      const data = await prisma.user.findMany({
        orderBy: { fname: "asc" },
        where: {
          role: { not: Role.SUPERADMIN },
          isActive: true,
          ...(key && {
            OR: [
              { fname: { contains: key, mode: "insensitive" } },
              { lname: { contains: key, mode: "insensitive" } },
              { email: { contains: key, mode: "insensitive" } },
              { phone: { contains: key, mode: "insensitive" } },
            ],
          }),
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          role: true,
          avatar: { select: { url: true } },
        },
      });

      return data.sort((a, b) => a.role.localeCompare(b.role));
    } catch (error) {
      throw error;
    }
  }

  async getAdmins() {
    try {
      const role = Role.ADMIN;

      const data = await prisma.user.findMany({
        where: { isActive: true, role },
        select: {
          id: true,
          fname: true,
          lname: true,
          role: true,
          avatar: true,
          phone: true,
          email: true,
          createdAt: true,
        },
      });

      return data;
    } catch (error) {
      throw error;
    }
  }

  async getWorkers(query) {
    let { page, limit, sort, reverse } = query;

    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse = reverse === "true";
    sort = allowedColumnKeys.includes(sort) ? sort : "fname";

    const argsWhere = {
      isActive: true,
      role: Role.WORKER,
    };

    try {
      const count = await prisma.user.count({
        where: argsWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const data = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        take: limit,
        skip: (page - 1) * limit,
        where: argsWhere,
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          tasks: {
            where: { task: { isActive: true } },
            select: {
              id: true,
              task: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  startDate: true,
                  endDate: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
          objects: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          blockedUntil: true,
          permissions: true,
          lastSeans: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  async createInObject({ data, createdById }) {
    const { object_id: objectId, phone, email, password, lname, fname } = data;

    try {
      const object = await prisma.object.findFirst({
        where: { isActive: true, id: objectId },
        select: { id: true },
      });
      if (!object) throw new AppError(404, "object_not_found");

      const condidatPhone = await prisma.user.findUnique({
        where: { phone: phone },
      });
      if (condidatPhone) {
        if (condidatPhone.isActive === false) throw new AppError(400, "phone_already_taken_and_but_that_user_disabled");
        else throw new AppError(400, "phone_already_taken");
      }

      const condidatEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (condidatEmail) {
        if (condidatEmail.isActive === false) throw new AppError(400, "email_already_taken_and_but_that_user_disabled");
        else throw new AppError(400, "email_already_taken");
      }

      const passwordHash = await hashPassword(password);

      const { object_id: _, clearData } = data;

      const { id: userId } = await prisma.user.create({
        data: {
          ...clearData,
          password: passwordHash,
          role: Role.WORKER,
          createdById,
        },
        select: { id: true },
      });

      await prisma.object.update({
        where: { isActive: true, id: objectId },
        data: { assigned: { connect: [{ id: userId }] } },
      });

      await SMS.send(`998${phone}`, `Rsq.uz Hurmatli ${fname + " " + lname} siz uchun profil yaratildi. Login: +998${phone} Pochta: ${email} Parol: ${password} Tizimga kirish uchun: rsq.uz/kabinet`);

      return;
    } catch (error) {
      throw error;
    }
  }

  async removeAssignFromObject({ objectId, workerId }) {
    try {
      const object = await prisma.object.findFirst({
        where: { id: objectId, isActive: true },
      });
      if (!object) throw new AppError(404, "object_not_found");

      this.getById(workerId);

      await prisma.object.update({
        where: { id: objectId },
        data: {
          assigned: {
            disconnect: [{ id: workerId }],
          },
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async getFilteredByRole() {
    try {
      const data = await prisma.user.findMany({
        where: {
          isActive: true,
          NOT: { role: Role.SUPERADMIN },
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          email: true,
          phone: true,
          role: true,
          avatar: true,
        },
      });

      const filtered = {
        admin: [],
        accountant: [],
        worker: [],
        pto: [],
      };

      data.forEach((user) => filtered[user.role.toLocaleLowerCase()].push(user));

      return filtered;
    } catch (error) {
      throw error;
    }
  }

  async getWithBalance(query) {
    let { page, limit, sort, reverse, key } = query;

    key = typeof key === "string" ? key.trim() : null;
    page = !isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse = reverse === "true";
    sort = allowedColumnKeysForGetUsersWithBalance.includes(sort) ? sort : "fname";

    const findWhere = {
      role: { not: Role.SUPERADMIN },
      isActive: true,
      ...(key && {
        OR: [
          { fname: { contains: key, mode: "insensitive" } },
          { lname: { contains: key, mode: "insensitive" } },
          { email: { contains: key, mode: "insensitive" } },
          { phone: { contains: key, mode: "insensitive" } },
        ],
      }),
    };

    try {
      const count = await prisma.user.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const users = await prisma.user.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        include: {
          avatar: true,
          acceptedTransfers: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          createdTransactions: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      const data = users.map((u) => ({
        id: u.id,
        fname: u.fname,
        lname: u.lname,
        phone: u.phone,
        email: u.email,
        role: u.role,
        fund: {
          balance: u.balance,
          totalSpent: u.totalExpense,
          totalGiven: u.totalIncome,
        },
        avatar: u.avatar ? { url: u.avatar.url } : null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));

      return {
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  async getUserTransfers({ userId, query }) {
    let { page, limit, reverse, sort } = query;

    page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    reverse !== "false";
    sort = ["createdAt", "amount"].includes(sort) ? sort : "createdAt";

    const argsWhere = {
      isActive: true,
      OR: [{ createdById: userId }, { recipientUserId: userId }],
    };

    try {
      const user = await prisma.user.findFirst({
        where: { id: userId, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          avatar: {
            select: { url: true },
          },
          balance: true,
        },
      });
      if (!user) throw new AppError(404, "user_not_found");

      const count = await prisma.fundTransfer.count({
        where: argsWhere,
      });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [data] = await Promise.all([
        prisma.fundTransfer.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: argsWhere,
          select: {
            id: true,
            amount: true,
            contractNumber: true,
            note: true,
            recipientUserId: true,
            fromObject: { select: { id: true, name: true } },
            toObject: { select: { id: true, name: true } },
            fromOrganization: { select: { id: true, organizationName: true } },
            toOrganization: { select: { id: true, organizationName: true } },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: {
                  select: { url: true },
                },
                role: true,
              },
            },
            recipientUser: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: {
                  select: { url: true },
                },
                role: true,
              },
            },
            createdAt: true,
          },
        }),
      ]);

      return {
        page,
        totalPage,
        totalCount: count,
        limit,
        sort,
        reverse,
        data,
        user,
        totals: {
          remainingAmount: user.balance,
          amountReceived: user.totalIncome,
          amountSpent: user.totalExpense,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async changeUserPassword(data) {
    const { userId, new_password: newPassword } = data;

    try {
      await this.getById(userId);

      const passwordHash = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: userId },
        data: {
          password: passwordHash,
          pwdVersion: { increment: 1 },
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async getUserIncomeExpenditure({ id, query }) {
    let { page, limit, object: objectId } = query;

    page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
    limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
    objectId = !Number.isNaN(Number(objectId)) && Number(objectId) > 0 && Number.isInteger(Number(objectId)) ? Number(objectId) : null;

    const totalPage = Math.ceil(count / limit);
    page = !totalPage ? 1 : page > totalPage ? totalPage : page;
    const skip = (page - 1) * limit;

    try {
      const user = await prisma.user.findFirst({
        where: { id, isActive: true },
        include: { avatar: true },
        omit: { password: true },
      });
      if (!user) throw new AppError(404, "user_not_found");

      let object = null;
      if (objectId) {
        object = await prisma.object.findFirst({
          where: { id: objectId, isActive: true },
          select: { id: true },
        });
      }

      const transferWhere = {
        isActive: true,
        OR: [{ senderUserId: id }, { recipientUserId: id }],
        ...(object && { OR: [{ toObjectId: objectId }, { fromObjectId: objectId }] }),
      };

      const transactionWhere = {
        isActive: true,
        createdById: id,
        usedFromOrganizationBalance: false,
        ...(object && { objectId }),
      };

      const [transfersCount, transactionsCount] = await Promise.all([
        prisma.fundTransfer.count({
          where: transferWhere,
        }),
        prisma.transaction.count({ where: transactionWhere }),
      ]);
      const count = transfersCount + transactionsCount;

      let amountReceived = 0n;
      let amountSpent = 0n;

      const transferStats = await Promise.all([
        prisma.fundTransfer.aggregate({
          where: { ...transferWhere, recipientUserId: id },
          _sum: { amount: true },
        }),
        prisma.fundTransfer.aggregate({
          where: { ...transferWhere, senderUserId: id },
          _sum: { amount: true },
        }),
      ]);

      const transactionStats = await Promise.all([
        prisma.transaction.aggregate({
          where: { ...transactionWhere, type: TransactionType.INCOME },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { ...transactionWhere, type: TransactionType.EXPENSE },
          _sum: { amount: true },
        }),
      ]);

      amountReceived = (transferStats[0]?._sum.amount || 0n) + (transactionStats[0]?._sum.amount || 0n);
      amountSpent = (transferStats[1]?._sum.amount || 0n) + (transactionStats[1]?._sum.amount || 0n);

      //   const remainingAmount = amountReceived - amountSpent;

      const [transfers, transactions] = await Promise.all([
        prisma.fundTransfer.findMany({
          orderBy: { createdAt: "desc" },
          where: transferWhere,
          select: {
            id: true,
            amount: true,
            contractNumber: true,
            note: true,
            recipientUserId: true,
            fromObject: {
              select: { id: true, name: true },
            },
            toObject: {
              select: { id: true, name: true },
            },
            fromOrganization: {
              select: { id: true, organizationName: true },
            },
            toOrganization: {
              select: { id: true, organizationName: true },
            },
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: {
                  select: { url: true },
                },
                role: true,
              },
            },
            recipientUser: {
              select: {
                id: true,
                fname: true,
                lname: true,
                avatar: {
                  select: { url: true },
                },
                role: true,
              },
            },
            createdAt: true,
          },
        }),
        prisma.transaction.findMany({
          orderBy: { date: "desc" },
          where: transactionWhere,
          include: {
            attachments: true,
            items: true,
            object: true,
            organization: true,
            salaryPayment: { include: { owner: true } },
          },
        }),
      ]);

      const joined = [
        ...transactions.map((t) => ({
          ...t,
          t: "transaction",
          date: t.date,
        })),
        ...transfers.map((t) => ({ ...t, t: "transfer", date: t.createdAt })),
      ];

      const sorted = joined.sort((a, b) => new Date(b.date) - new Date(a.date));
      const result = sorted.slice(skip, skip + limit > count ? count : skip + limit);

      return {
        page,
        totalPage,
        totalCount: count,
        limit,
        user: {
          id: user.id,
          fname: user.fname,
          lname: user.lname,
          avatar: user.avatar ? { url: user.avatar.url } : null,
        },
        data: result.map((t) => {
          if (t.t === "transfer") {
            return {
              t: t.t,
              id: t.id,
              amount: fromMinorUnits(t.amount),
              contractNumber: t.contractNumber,
              note: t.note,
              fromObject: t.fromObject || null,
              toObject: t.toObject || null,
              fromOrganization: t.fromOrganization || null,
              toOrganization: t.toOrganization || null,
              createdBy: t.createdBy,
              recipientUser: t.recipientUser,
              createdAt: t.createdAt,
              date: t.date,
            };
          } else if (t.t === "transaction") {
            return {
              t: t.t,
              id: t.id,
              notes: t.notes,
              amount: fromMinorUnits(t.amount),
              date: t.date,
              purpose: t.purpose,
              isReviewed: t.isReviewed,
              isSalary: t.isSalary,
              type: t.type,
              object: t.object || null,
              attachments: t.attachments.map((a) => ({
                id: a.id,
                url: a.url,
                originalname: a.originalname,
                filesize: a.filesize,
                mimeType: a.mimeType,
              })),
              organization: t.organization || null,
              usedFromOrganizationBalance: t.usedFromOrganizationBalance,
              salaryPayment: t.salaryPayment
                ? {
                    id: t.salaryPayment.id,
                    owner: {
                      id: t.salaryPayment.owner.id,
                      fname: t.salaryPayment.owner.fname,
                      lname: t.salaryPayment.owner.lname,
                    },
                  }
                : null,
              items: t.items.map((i) => ({
                id: i.id,
                name: i.name,
                parameter: i.parameter,
                quantity: i.quantity,
                pricePerUnit: i.pricePerUnit,
                totalPrice: i.totalPrice,
                unit: i.unit,
              })),
              updatedAt: t.updatedAt,
            };
          }
        }),
        totals: {
          remainingAmount: remainingAmount,
          amountReceived: amountReceived,
          amountSpent: amountSpent,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async getNames(key) {
    try {
      const data = await prisma.user.findMany({
        orderBy: { fname: "asc" },
        where: {
          role: { not: "SUPERADMIN" },
          isActive: true,
          ...(key && {
            OR: [
              {
                fname: { contains: key, mode: "insensitive" },
              },
              { lname: { contains: key, mode: "insensitive" } },
            ],
          }),
        },
        select: {
          id: true,
          fname: true,
          lname: true,
          avatar: {
            select: {
              url: true,
            },
          },
        },
      });

      return data;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new UserService();
