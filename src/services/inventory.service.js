const { InventoryHistoryType, Unit } = require("../lib/prisma");
const AppError = require("../utils/AppError");
const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const { idChecker } = require("../utils/idChecker");
const sleep = require("../utils/sleep");
const { fromMinorUnits } = require("../utils/amount");
const getWeekRange = require("../utils/getWeekRange");
const storage = require("../lib/storage");

const allowedColumnKeys = ["name", "createdAt", "totalPrice", "pricePerUnit", "updatedAt"];

class inventoryService {
  async create(req) {
    const {
      body: { name, unit, sku = "", pricePerUnit },
      user: { id: createdById },
      files,
    } = req;

    try {
      const nameCondidat = await prisma.inventory.findFirst({
        where: { name, isActive: true },
      });
      if (nameCondidat) {
        throw new AppError(400, "inventory_already_exists_with_this_name");
      }

      const newInventory = await prisma.inventory.create({
        data: {
          sku,
          name,
          unit,
          pricePerUnit,
          createdById,
        },
      });

      if (files && Array.isArray(files) && files.length) {
        const uploadedFiles = await storage.saveMany(files);
        if (uploadedFiles.length) {
          await prisma.attachment.createMany({
            data: uploadedFiles.map((u) => {
              return {
                ...u,
                inventoryId: newInventory.id,
                createdById,
              };
            }),
          });
        }
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async getList(query) {
    let { page, limit, reverse, sort, key } = query;

    try {
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "name";
      key = typeof key === "string" ? key.trim() : null;

      const findWhere = {
        isActive: true,
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { sku: { contains: key, mode: "insensitive" } }] }),
      };

      const count = await prisma.inventory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [inventories, agg] = await Promise.all([
        prisma.inventory.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            avatars: true,
            createdBy: true,
            _count: { select: { history: true } },
          },
        }),
        prisma.inventory.aggregate({
          where: { isActive: true },
          _count: true,
          _sum: { totalPrice: true, quantity: true },
        }),
      ]);

      return {
        data: inventories.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          quantity: Number(i.quantity),
          totalInput: Number(i.totalInput),
          totalOutput: Number(i.totalOutput),
          pricePerUnit: i.pricePerUnit,
          totalPrice: i.totalPrice,
          unit: i.unit,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          history: i._count.history,
          images: i.avatars.map((a) => ({ id: a.id, url: a.url, originalname: a.originalname, filesize: a.filesize })),
          createdBy: i.createdBy ? { id: i.createdBy.id, fname: i.createdBy.fname, lname: i.createdBy.lname, role: i.createdBy.role } : null,
        })),
        page,
        limit,
        totalPage,
        reverse,
        sort,
        totals: { totalTypes: agg._count, totalQuantity: Number(agg._sum.quantity), totalAmount: agg._sum.totalPrice },
      };
    } catch (error) {
      throw error;
    }
  }

  async historiesList(query) {
    let { page, limit, reverse, sort, type, createdBy, executedBy, object, organization, branchId, from, to, date } = query;

    try {
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(page)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = ["createdAt", "quantity"].includes(sort) ? sort : "createdAt";
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;
      branchId =
        !Number.isNaN(Number(branchId)) &&
        Number(branchId) > 0 &&
        Number.isInteger(Number(branchId)) &&
        (await prisma.branch.findFirst({
          where: { isActive: true, id: Number(branchId) },
        }))
          ? Number(branchId)
          : null;
      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({
          where: { isActive: true, id: Number(object) },
        }))
          ? Number(object)
          : null;
      organization =
        !Number.isNaN(Number(organization)) &&
        Number(organization) > 0 &&
        Number.isInteger(Number(organization)) &&
        (await prisma.organization.findFirst({
          where: { isActive: true, id: Number(organization) },
        }))
          ? Number(organization)
          : null;
      createdBy =
        !Number.isNaN(Number(createdBy)) &&
        Number(createdBy) > 0 &&
        Number.isInteger(Number(createdBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(createdBy) },
        }))
          ? Number(createdBy)
          : null;
      executedBy =
        !Number.isNaN(Number(executedBy)) &&
        Number(executedBy) > 0 &&
        Number.isInteger(Number(executedBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(executedBy) },
        }))
          ? Number(executedBy)
          : null;
      from = !Number.isNaN(Date.parse(from)) ? new Date(from) : null;
      if (from) from.setHours(0, 0, 0, 0);
      to = !Number.isNaN(Date.parse(to)) ? new Date(to) : null;
      if (to) to.setHours(23, 59, 59, 999);

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            from = new Date(new Date().setHours(0, 0, 0, 0));
            to = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            from = startOfWeek;
            to = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            from = new Date(startOfMonth);
            to = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            from = new Date(startOfYear);
            to = new Date(endOfYear);
            break;
        }
      }

      const findWhere = {
        isActive: true,
        OR: [
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
          { transactionItemId: null },
        ],
        inventory: { isActive: true },
        ...(type && { type }),
        ...(branchId && { branchId }),
        ...(object && { objectId: object }),
        ...(organization && { organizationId: organization }),
        ...(createdBy && { createdById: createdBy }),
        ...(executedBy && { executedById: executedBy }),
        ...((from || to) && {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      };

      const count = await prisma.inventoryHistory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const histories = await prisma.inventoryHistory.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        include: {
          inventory: {
            where: { isActive: true },
            include: {
              avatars: {
                where: { isActive: true },
                select: { id: true, url: true, originalname: true, filesize: true },
              },
            },
          },
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          organization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          branch: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          executedBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          attachments: {
            where: { isActive: true },
            select: { id: true, url: true, originalname: true, filesize: true },
          },
          transactionItem: {
            include: {
              transaction: {
                include: {
                  attachments: {
                    where: { isActive: true },
                    select: { id: true, url: true, originalname: true, filesize: true },
                  },
                },
              },
            },
          },
        },
      });

      const result = histories.map((h) => ({
        id: h.id,
        type: h.type,
        quantity: Number(h.quantity),
        description: h.description,
        createdAt: h.createdAt,
        pricePerUnit: h.pricePerUnit,
        totalPrice: h.totalPrice,
        organization: h.organization,
        object: h.object,
        branch: h.branch,
        createdBy: h.createdBy,
        executedBy: h.executedBy,
        attachments: h.attachments.length > 0 ? h.attachments : h.transactionItem?.transaction?.attachments || [],
        inventory: h.inventory
          ? {
              id: h.inventory.id,
              name: h.inventory.name,
              pricePerUnit: h.inventory.pricePerUnit,
              unit: h.inventory.unit,
              sku: h.inventory.sku,
              images: h.inventory.avatars,
            }
          : null,
      }));

      return {
        page,
        limit,
        totalPage,
        count,
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }

  async userHistoriesList(query, userId) {
    let { page, limit, reverse, sort, type, object, organization, branch, from, to, date } = query;

    try {
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = ["createdAt", "quantity"].includes(sort) ? sort : "createdAt";
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;
      branch =
        !Number.isNaN(Number(branch)) &&
        Number(branch) > 0 &&
        Number.isInteger(Number(branch)) &&
        (await prisma.branch.findFirst({
          where: { isActive: true, id: Number(branch) },
        }))
          ? Number(branch)
          : null;
      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({
          where: { isActive: true, id: Number(object) },
        }))
          ? Number(object)
          : null;
      organization =
        !Number.isNaN(Number(organization)) &&
        Number(organization) > 0 &&
        Number.isInteger(Number(organization)) &&
        (await prisma.organization.findFirst({
          where: { isActive: true, id: Number(organization) },
        }))
          ? Number(organization)
          : null;
      from = !Number.isNaN(Date.parse(from)) ? new Date(from) : null;
      if (from) from.setHours(0, 0, 0, 0);
      to = !Number.isNaN(Date.parse(to)) ? new Date(to) : null;
      if (to) to.setHours(23, 59, 59, 999);

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            from = new Date(new Date().setHours(0, 0, 0, 0));
            to = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            from = startOfWeek;
            to = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            from = new Date(startOfMonth);
            to = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            from = new Date(startOfYear);
            to = new Date(endOfYear);
            break;
        }
      }

      const findWhere = {
        isActive: true,
        OR: [
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
          { transactionItemId: null },
        ],
        inventory: { isActive: true },
        OR: [{ createdById: userId }, { executedById: userId }],
        ...(type && { type }),
        ...(object && { objectId: object }),
        ...(branch && { branchId: branch }),
        ...(organization && { organizationId: organization }),
        ...((from || to) && {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      };

      const count = await prisma.inventoryHistory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const histories = await prisma.inventoryHistory.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        include: {
          inventory: {
            where: { isActive: true },
            include: {
              avatars: {
                where: { isActive: true },
                select: { id: true, url: true, originalname: true, filesize: true },
              },
            },
          },
          attachments: {
            where: { isActive: true },
            select: { id: true, url: true, originalname: true, filesize: true },
          },
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          organization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          branch: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          executedBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
          transactionItem: {
            include: {
              transaction: {
                include: {
                  attachments: {
                    where: { isActive: true },
                    select: { id: true, url: true, originalname: true, filesize: true },
                  },
                },
              },
            },
          },
        },
      });

      const result = histories.map((h) => ({
        id: h.id,
        type: h.type,
        quantity: Number(h.quantity),
        description: h.description,
        createdAt: h.createdAt,
        inventory: h.inventory
          ? {
              id: h.inventory.id,
              name: h.inventory.name,
              unit: h.inventory.unit,
              sku: h.inventory.sku,
              images: h.inventory.avatars,
            }
          : null,
        organization: h.organization,
        object: h.object,
        branch: h.branch,
        createdBy: h.createdBy,
        executedBy: h.executedBy,
        attachments: h.attachments.length ? h.attachments : h.transactionItem?.transaction?.attachments || [],
      }));

      return {
        page,
        limit,
        totalPage,
        count,
        data: result,
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(id, query) {
    try {
      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: true },
        include: {
          avatars: {
            where: { isActive: true },
            select: { id: true, url: true, originalname: true, filesize: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, role: true },
          },
        },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      let { page, limit, reverse, sort, type, createdBy, executedBy, object, organization, branchId, from, to, date } = query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = ["createdAt", "quantity"].includes(sort) ? sort : "createdAt";
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;
      branchId =
        !Number.isNaN(Number(branchId)) &&
        Number(branchId) > 0 &&
        Number.isInteger(Number(branchId)) &&
        (await prisma.branch.findFirst({
          where: { isActive: true, id: Number(branchId) },
        }))
          ? Number(branchId)
          : null;
      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({
          where: { isActive: true, id: Number(object) },
        }))
          ? Number(object)
          : null;
      organization =
        !Number.isNaN(Number(organization)) &&
        Number(organization) > 0 &&
        Number.isInteger(Number(organization)) &&
        (await prisma.organization.findFirst({
          where: { isActive: true, id: Number(organization) },
        }))
          ? Number(organization)
          : null;
      createdBy =
        !Number.isNaN(Number(createdBy)) &&
        Number(createdBy) > 0 &&
        Number.isInteger(Number(createdBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(createdBy) },
        }))
          ? Number(createdBy)
          : null;
      executedBy =
        !Number.isNaN(Number(executedBy)) &&
        Number(executedBy) > 0 &&
        Number.isInteger(Number(executedBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(executedBy) },
        }))
          ? Number(executedBy)
          : null;
      from = !Number.isNaN(Date.parse(from)) ? new Date(from) : null;
      if (from) from.setHours(0, 0, 0, 0);
      to = !Number.isNaN(Date.parse(to)) ? new Date(to) : null;
      if (to) to.setHours(23, 59, 59, 999);

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            from = new Date(new Date().setHours(0, 0, 0, 0));
            to = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            from = startOfWeek;
            to = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            from = new Date(startOfMonth);
            to = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            from = new Date(startOfYear);
            to = new Date(endOfYear);
            break;
        }
      }

      const findWhere = {
        isActive: true,
        OR: [
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
          { transactionItemId: null },
        ],
        inventoryId: id,
        ...(type && { type }),
        ...(object && { objectId: object }),
        ...(organization && { organizationId: organization }),
        ...(createdBy && { createdById: createdBy }),
        ...(executedBy && { executedById: executedBy }),
        ...(branchId && { branchId }),
        ...((from || to) && {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      };

      const count = await prisma.inventoryHistory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [histories, grouped, batchesRes] = await Promise.all([
        prisma.inventoryHistory.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            createdBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true, role: true },
            },
            executedBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true, role: true },
            },
            object: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            organization: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            branch: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            attachments: {
              where: { isActive: true },
              select: { id: true, url: true, originalname: true, filesize: true },
            },
            transactionItem: {
              include: {
                transaction: {
                  include: {
                    attachments: {
                      where: { isActive: true },
                      select: { id: true, url: true, originalname: true, filesize: true },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.inventoryHistory.groupBy({
          by: ["type"],
          _sum: { quantity: true },
          _count: true,
          where: {
            isActive: true,
            inventoryId: id,
            ...(branchId && { branchId }),
          },
        }),
        prisma.$queryRaw`
          SELECT
            ih.price_per_unit AS "pricePerUnit",
            SUM(
              CASE WHEN ih.type = 'INPUT' THEN ih.quantity
                  ELSE -ih.quantity
              END
            ) AS quantity
          FROM public."InventoryHistory" ih
          LEFT JOIN public."TransactionItem" ti ON ti.id = ih.transaction_item_id
          LEFT JOIN public."Transaction" t ON t.id = ti.transaction_id
          WHERE ih.inventary_id = ${id}
            AND ih.is_active = true
            AND (
              ti.id IS NULL
              OR (ti.is_active = true AND t.is_active = true)
            )
          GROUP BY ih.price_per_unit
          HAVING SUM(
            CASE WHEN ih.type = 'INPUT' THEN ih.quantity
                ELSE -ih.quantity
            END
          ) != 0
          ORDER BY ih.price_per_unit;
        `,
      ]);

      const map = new Map();

      for (const b of batchesRes) {
        const price = b.pricePerUnit.toString();

        if (!map.has(price)) {
          map.set(price, {
            pricePerUnit: b.pricePerUnit,
            quantity: 0,
            unit: inventory.unit,
          });
        }

        const qty = Number(b.quantity || 0);

        if (b.type === "INPUT") {
          map.get(price).quantity += qty;
        } else {
          map.get(price).quantity -= qty;
        }
      }

      const batches = Array.from(map.values()).filter((b) => b.quantity !== 0);

      return {
        page,
        limit,
        count,
        totalPage,
        inventory: {
          id: inventory.id,
          name: inventory.name,
          quantity: Number(inventory.quantity),
          unit: inventory.unit,
          pricePerUnit: inventory.pricePerUnit,
          totalPrice: inventory.totalPrice,
          createdBy: inventory.createdBy,
          images: inventory.avatars,
        },
        batches,
        histories: histories.map((h) => ({
          id: h.id,
          type: h.type,
          quantity: Number(h.quantity),
          pricePerUnit: h.pricePerUnit,
          totalPrice: h.totalPrice,
          description: h.description,
          createdAt: h.createdAt,
          object: h.object,
          organization: h.organization,
          branch: h.branch,
          executedBy: h.executedBy,
          createdBy: h.createdBy,
          attachments: h.attachments.length ? h.attachments : h.transactionItem?.transaction?.attachments || [],
        })),
        totals: {
          totalHistoryCount: grouped.reduce((sum, g) => (g._count || 0) + sum, 0),
          inputHistoryCount: grouped.find((g) => g.type === "INPUT")?._count || 0,
          outputHistoryCount: grouped.find((g) => g.type === "OUTPUT")?._count || 0,
          amountQuantityInputs: Number(grouped.find((g) => g.type === "INPUT")?._sum.quantity || 0n),
          amountQuantityOutputs: Number(grouped.find((g) => g.type === "OUTPUT")?._sum.quantity || 0n),
          currentQuantity: Number(inventory.quantity),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async update(id, body) {
    const { pricePerUnit, sku = "", name, unit } = body;

    try {
      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: true },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      if (name !== inventory.name) {
        const condidat = await prisma.inventory.findFirst({
          where: { isActive: true, name, id: { not: id } },
        });
        if (condidat) {
          throw new AppError(400, "inventory_already_exists_with_this_name");
        }
      }

      await prisma.inventory.update({
        where: { id },
        data: { pricePerUnit, sku, name, unit },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async softDelete(id, deletedById) {
    try {
      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: true },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      await prisma.inventory.update({
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
    let { page, limit, reverse, sort, key } = query;

    try {
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "deletedAt";
      key = typeof key === "string" ? key.trim() : null;

      const findWhere = {
        isActive: false,
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { sku: { contains: key, mode: "insensitive" } }] }),
      };

      const count = await prisma.inventory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [inventories] = await Promise.all([
        prisma.inventory.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          include: {
            avatars: {
              where: { isActive: true },
              select: { url: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true },
            },
            deletedBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true },
            },
            _count: { select: { history: true } },
          },
        }),
      ]);

      return {
        data: inventories.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          quantity: Number(i.quantity),
          totalInput: Number(i.totalInput),
          totalOutput: Number(i.totalOutput),
          pricePerUnit: i.pricePerUnit,
          totalPrice: i.totalPrice,
          unit: i.unit,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          deletedAt: i.deletedAt,
          history: i._count.history,
          images: i.avatars,
          createdBy: i.createdBy,
          deletedBy: i.deletedBy,
        })),
        page,
        limit,
        totalPage,
        count,
        reverse,
        sort,
      };
    } catch (error) {
      throw error;
    }
  }

  async restore(id) {
    try {
      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: false },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      const condidat = await prisma.inventory.findFirst({
        where: { isActive: true, name: inventory.name },
      });
      if (condidat) {
        throw new AppError(400, "inventory_already_exists_with_this_name");
      }

      await prisma.inventory.update({
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
      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: false },
        include: {
          avatars: true,
          history: { include: { attachments: true } },
        },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      await prisma.inventory.delete({
        where: { id },
      });

      const attachments = [];
      if (inventory.avatars.length) {
        for (const a of inventory.avatars) {
          attachments.push(a.filename);
        }
      }

      if (inventory.history.length) {
        for (const h of inventory.history) {
          if (h.attachments.length) {
            for (const a of h.attachments) {
              attachments.push(a.filename);
            }
          }
        }
      }

      if (attachments.length) {
        await storage.deleteMany(attachments);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async createHistory(req) {
    try {
      let {
        body: { description = "", type, branchId, quantity, pricePerUnit, organizationId, objectId, executedById },
        user: { id: createdById },
        params: { id },
        files,
      } = req;

      const inventoryId = idChecker(id);
      if (!inventoryId) throw new AppError(400, "bad_request");

      await prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.findFirst({
          where: { id: inventoryId, isActive: true },
        });
        if (!inventory) throw new AppError(404, "inventory_not_found");

        if (Math.abs(quantity) > 999999999999999.999) throw new AppError(400, "quantity_too_large");

        if (branchId) {
          const branch = await tx.branch.findFirst({
            where: { id: branchId, isActive: true },
          });
          if (!branch) throw new AppError(404, "branch_not_found");
        }

        if (organizationId) {
          const organization = await tx.organization.findFirst({
            where: { isActive: true, id: organizationId },
          });
          if (!organization) throw new AppError(404, "organization_not_found");
        }

        if (objectId) {
          const object = await tx.object.findFirst({
            where: { id: objectId, isActive: true },
          });
          if (!object) throw new AppError(404, "object_not_found");
        }

        if (executedById) {
          const executedBy = await tx.user.findFirst({
            where: { id: executedById, isActive: true, role: { not: "SUPERADMIN" } },
          });
          if (!executedBy) throw new AppError(404, "executed_by_not_found");
        }

        const newInventoryHistory = await tx.inventoryHistory.create({
          data: {
            branchId,
            description,
            type,
            inventoryId,
            quantity,
            pricePerUnit,
            totalPrice: BigInt(Math.floor(Number(pricePerUnit) * quantity)),
            organizationId,
            objectId,
            executedById,
            createdById,
          },
        });

        await this._recalcInventory(tx, inventoryId);

        if (files && Array.isArray(files) && files.length) {
          const uploadedFiles = await storage.saveMany(files);

          if (uploadedFiles.length) {
            await tx.attachment.createMany({
              data: uploadedFiles.map((u) => ({
                ...u,
                inventoryHistoryId: newInventoryHistory.id,
                createdById,
              })),
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

  async updateHistory(inventoryHistoryId, body) {
    const maxRetries = 3;
    let attempt = 0;

    let { description = "", quantity, organizationId, objectId, executedById, branchId } = body;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const inventoryHistory = await tx.inventoryHistory.findFirst({
            where: {
              id: inventoryHistoryId,
              isActive: true,
              inventory: { isActive: true },
            },
            include: { inventory: true },
          });
          if (!inventoryHistory) throw new AppError(404, "inventory_history_not_found");

          if (branchId) {
            const branch = await tx.branch.findFirst({
              where: { id: branchId, isActive: true },
            });
            if (!branch) throw new AppError(404, "branch_not_found");
          }

          if (organizationId) {
            const organization = await tx.organization.findFirst({
              where: { isActive: true, id: organizationId },
            });
            if (!organization) throw new AppError(404, "organization_not_found");
          }

          if (objectId) {
            const object = await tx.object.findFirst({
              where: { id: objectId, isActive: true },
            });
            if (!object) throw new AppError(404, "object_not_found");
          }

          if (executedById) {
            const executedBy = await tx.user.findFirst({
              where: { id: executedById, isActive: true },
            });
            if (!executedBy) throw new AppError(404, "executed_by_not_found");
          }

          const inventory = inventoryHistory.inventory;

          await tx.inventoryHistory.update({
            where: { id: inventoryHistoryId },
            data: {
              branchId,
              quantity,
              description,
              organizationId,
              objectId,
              executedById,
            },
          });

          await this._recalcInventory(tx, inventory.id);

          return;
        });
        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "fund_conflict_retry_failed");
  }

  async softDeleteHistory(inventoryHistoryId, deletedById) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        await prisma.$transaction(async (tx) => {
          const inventoryHistory = await tx.inventoryHistory.findFirst({
            where: { id: inventoryHistoryId, isActive: true, inventory: { isActive: true } },
            include: { inventory: true, transactionItem: true },
          });
          if (!inventoryHistory) throw new AppError(404, "inventory_history_not_found");
          const inventory = inventoryHistory.inventory;

          await tx.inventoryHistory.update({
            where: { id: inventoryHistoryId },
            data: {
              isActive: false,
              deletedById,
              deletedAt: new Date(),
            },
          });

          await this._recalcInventory(tx, inventory.id);

          return;
        });
        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "fund_conflict_retry_failed");
  }

  async historiesTrashList(query) {
    let { page, limit, reverse, sort, key, type } = query;

    try {
      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = ["createdAt", "updatedAt", "deletedAt"].includes(sort) ? sort : "deletedAt";
      key = typeof key === "string" ? key.trim() : null;
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;

      const findWhere = {
        isActive: false,
        inventory: { isActive: true },
        ...(type && { type }),
        ...(key && {
          inventory: {
            OR: [{ name: { contains: key, mode: "insensitive" } }, { sku: { contains: key, mode: "insensitive" } }],
          },
        }),
      };

      const count = await prisma.inventoryHistory.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [deletedHistories] = await Promise.all([
        prisma.inventoryHistory.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            inventory: {
              where: { isActive: true },
              include: {
                avatars: {
                  where: { isActive: true },
                  select: { url: true },
                },
              },
            },
            organization: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            object: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            branch: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            deletedBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true },
            },
            executedBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true },
            },
            attachments: {
              where: { isActive: true },
              select: { url: true },
            },
          },
        }),
      ]);

      return {
        data: deletedHistories.map((i) => ({
          id: i.id,
          quantity: Number(i.quantity),
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          deletedAt: i.deletedAt,
          description: i.description,
          attachments: i.attachments,
          type: i.type,
          organization: i.organization,
          object: i.object,
          branch: i.branch,
          createdBy: i.createdBy,
          executedBy: i.executedBy,
          deletedBy: i.deletedBy,
          inventory: i.inventory
            ? {
                id: i.inventory.id,
                name: i.inventory.name,
                unit: i.inventory.unit,
                avatars: i.inventory.avatars,
                pricePerUnit: i.inventory.pricePerUnit,
                totalPrice: fromMinorUnits(Number(i.inventory.pricePerUnit) * Number(i.quantity)),
              }
            : null,
        })),
        page,
        limit,
        totalPage,
        count,
        reverse,
        sort,
      };
    } catch (error) {
      throw error;
    }
  }

  async restoreHistory(id) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        const history = await prisma.inventoryHistory.findFirst({
          where: { isActive: false, id },
        });
        if (!history) throw new AppError(404, "inventory_history_not_found");

        await prisma.$transaction(async (tx) => {
          await tx.inventoryHistory.update({
            where: { id },
            data: {
              isActive: true,
              deletedById: null,
              deletedAt: null,
            },
          });

          await this._recalcInventory(tx, history.inventoryId);

          return;
        });
        return;
      } catch (err) {
        if (String(err.message).includes("VERSION_MISMATCH")) {
          if (attempt > maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
          const backoff = 50 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 50);
          await sleep(backoff + jitter);
          continue;
        } else {
          throw err;
        }
      }
    }
    throw new AppError(400, "fund_conflict_retry_failed");
  }

  async deleteHistory(id) {
    try {
      const history = await prisma.inventoryHistory.findFirst({
        where: { id, isActive: false },
        include: { attachments: true },
      });
      if (!history) {
        throw new AppError(404, "inventory_history_not_found");
      }

      await prisma.inventoryHistory.delete({
        where: { id },
      });

      const attachments = [];
      if (history.attachments.length) {
        for (const a of history.attachments) {
          attachments.push(a.filename);
        }
      }
      if (attachments.length) {
        await storage.deleteMany(attachments);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async getListForStaff(query) {
    let { page, limit, reverse, sort, key } = query;

    try {
      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "name";
      key = typeof key === "string" ? key.trim() : null;

      const findWhere = {
        isActive: true,
        ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }, { sku: { contains: key, mode: "insensitive" } }] }),
      };

      const count = await prisma.inventory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [inventories, agg] = await Promise.all([
        prisma.inventory.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            avatars: {
              where: { isActive: true },
              select: { id: true, url: true, originalname: true, filesize: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true, role: true },
            },
            _count: { select: { history: true } },
          },
        }),
        prisma.inventory.aggregate({
          where: { isActive: true },
          _count: true,
          _sum: { quantity: true },
        }),
      ]);

      return {
        data: inventories.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          quantity: Number(i.quantity),
          unit: i.unit,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          history: i._count.history,
          images: i.avatars,
          createdBy: i.createdBy,
        })),
        page,
        limit,
        totalPage,
        reverse,
        sort,
        totals: {
          totalTypes: agg._count,
          totalQuantity: Number(agg._sum.quantity),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async getByIdForStaff(req) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: true },
        include: {
          avatars: {
            where: { isActive: true },
            select: { id: true, url: true, originalname: true, filesize: true },
          },
        },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      let {
        query: { page, limit, reverse, sort, type, createdBy, executedBy, object, organization, branch, from, to, date },
        user: { id: userId },
      } = req;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = ["createdAt", "quantity"].includes(sort) ? sort : "createdAt";
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;
      branch =
        !Number.isNaN(Number(branch)) &&
        Number(branch) > 0 &&
        Number.isInteger(Number(branch)) &&
        (await prisma.branch.findFirst({
          where: { isActive: true, id: Number(branch) },
        }))
          ? Number(branch)
          : null;
      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({
          where: { isActive: true, id: Number(object) },
        }))
          ? Number(object)
          : null;
      organization =
        !Number.isNaN(Number(organization)) &&
        Number(organization) > 0 &&
        Number.isInteger(Number(organization)) &&
        (await prisma.organization.findFirst({
          where: { isActive: true, id: Number(organization) },
        }))
          ? Number(organization)
          : null;
      createdBy =
        !Number.isNaN(Number(createdBy)) &&
        Number(createdBy) > 0 &&
        Number.isInteger(Number(createdBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(createdBy) },
        }))
          ? Number(createdBy)
          : null;
      executedBy =
        !Number.isNaN(Number(executedBy)) &&
        Number(executedBy) > 0 &&
        Number.isInteger(Number(executedBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(executedBy) },
        }))
          ? Number(executedBy)
          : null;
      from = !Number.isNaN(Date.parse(from)) ? new Date(from) : null;
      if (from) from.setHours(0, 0, 0, 0);
      to = !Number.isNaN(Date.parse(to)) ? new Date(to) : null;
      if (to) to.setHours(23, 59, 59, 999);

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            from = new Date(new Date().setHours(0, 0, 0, 0));
            to = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK":
            const { startOfWeek, endOfWeek } = getWeekRange();
            from = startOfWeek;
            to = endOfWeek;
            break;
          case "MONTH":
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            from = new Date(startOfMonth);
            to = new Date(endOfMonth);
            break;
          case "YEAR":
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            from = new Date(startOfYear);
            to = new Date(endOfYear);
            break;
        }
      }

      const findWhere = {
        isActive: true,
        OR: [
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
          { transactionItemId: null },
        ],
        inventoryId: id,
        OR: [{ createdById: userId }, { executedById: userId }],
        ...(type && { type }),
        ...(object && { objectId: object }),
        ...(organization && { organizationId: organization }),
        ...(branch && { branchId: branch }),
        ...((from || to) && {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      };

      const count = await prisma.inventoryHistory.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [histories, grouped] = await Promise.all([
        prisma.inventoryHistory.findMany({
          orderBy: { [sort]: reverse ? "desc" : "asc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          include: {
            attachments: {
              where: { isActive: true },
              select: { url: true, mimeType: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true, role: true },
            },
            executedBy: {
              where: { isActive: true },
              select: { id: true, fname: true, lname: true, role: true },
            },
            object: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            organization: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            branch: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            transactionItem: {
              where: { isActive: true },
              include: {
                transaction: {
                  include: {
                    attachments: {
                      where: { isActive: true },
                      select: { id: true, url: true, originalname: true, filesize: true },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.inventoryHistory.groupBy({
          by: ["type"],
          _sum: { quantity: true },
          _count: true,
          where: {
            isActive: true,
            inventoryId: id,
            ...(branch && { branchId: branch }),
          },
        }),
      ]);

      return {
        page,
        limit,
        count,
        totalPage,
        inventory: {
          id: inventory.id,
          name: inventory.name,
          quantity: Number(inventory.quantity),
          unit: inventory.unit,
          images: inventory.avatars,
        },
        histories: histories.map((h) => ({
          id: h.id,
          type: h.type,
          quantity: Number(h.quantity),
          description: h.description,
          createdAt: h.createdAt,
          createdBy: h.createdBy,
          object: h.object,
          executedBy: h.executedBy,
          organization: h.organization,
          branch: h.branch,
          attachments: h.attachments.length > 0 ? h.attachments : h.transactionItem?.transaction?.attachments || [],
        })),
        totals: {
          totalHistoryCount: grouped.reduce((sum, g) => (g._count || 0) + sum, 0),
          inputHistoryCount: grouped.find((g) => g.type === "INPUT")?._count || 0,
          outputHistoryCount: grouped.find((g) => g.type === "OUTPUT")?._count || 0,
          amountQuantityInputs: Number(grouped.find((g) => g.type === "INPUT")?._sum.quantity || 0),
          amountQuantityOutputs: Number(grouped.find((g) => g.type === "OUTPUT")?._sum.quantity || 0),
          currentQuantity: Number(inventory.quantity),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async search(key) {
    try {
      return await prisma.inventory.findMany({
        where: {
          isActive: true,
          ...(key && { OR: [{ name: { contains: key, mode: "insensitive" } }] }),
        },
        select: {
          id: true,
          name: true,
          unit: true,
          parameter: true,
          pricePerUnit: true,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async getInventoryBatches(inventoryId) {
    try {
      const inventory = await prisma.inventory.findFirst({
        where: { id: inventoryId, isActive: true },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      const histories = await prisma.$queryRaw`
        SELECT
          ih.price_per_unit AS "pricePerUnit",
          SUM(
            CASE WHEN ih.type = 'INPUT' THEN ih.quantity
                ELSE -ih.quantity
            END
          ) AS quantity
        FROM public."InventoryHistory" ih
        LEFT JOIN public."TransactionItem" ti ON ti.id = ih.transaction_item_id
        LEFT JOIN public."Transaction" t ON t.id = ti.transaction_id
        WHERE ih.inventary_id = ${inventoryId}
          AND ih.is_active = true
          AND (
            ti.id IS NULL
            OR (ti.is_active = true AND t.is_active = true)
          )
        GROUP BY ih.price_per_unit
        HAVING SUM(
          CASE WHEN ih.type = 'INPUT' THEN ih.quantity
              ELSE -ih.quantity
          END
        ) != 0
        ORDER BY ih.price_per_unit;
      `;

      const map = new Map();

      for (const h of histories) {
        const price = h.pricePerUnit.toString();

        if (!map.has(price)) {
          map.set(price, {
            pricePerUnit: h.pricePerUnit,
            quantity: 0,
            unit: inventory.unit,
          });
        }

        const qty = Number(h.quantity || 0);

        if (h.type === "INPUT") {
          map.get(price).quantity += qty;
        } else {
          map.get(price).quantity -= qty;
        }
      }

      return Array.from(map.values()).filter((b) => b.quantity !== 0);
    } catch (error) {
      throw error;
    }
  }

  async _recalcInventory(tx, id) {
    try {
      const inventory = await tx.inventory.findFirst({
        where: { id },
      });
      if (!inventory) return;

      const commonWhere = {
        isActive: true,
        inventoryId: id,
        OR: [
          {
            transactionItem: null,
          },
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
        ],
      };

      const inputAgg = await tx.inventoryHistory.aggregate({
        where: {
          ...commonWhere,
          type: "INPUT",
        },
        _sum: { totalPrice: true, quantity: true },
      });

      const outputAgg = await tx.inventoryHistory.aggregate({
        where: {
          ...commonWhere,
          type: "OUTPUT",
        },
        _sum: { totalPrice: true, quantity: true },
      });

      const totalInput = Number(inputAgg._sum.quantity || 0);
      const totalOutput = Number(outputAgg._sum.quantity || 0);
      const quantity = totalInput - totalOutput;

      const inputPrice = inputAgg._sum.totalPrice || 0n;
      const outputPrice = outputAgg._sum.totalPrice || 0n;
      const totalPrice = inputPrice - outputPrice;

      const updateRes = await tx.inventory.updateMany({
        where: { id, version: inventory.version },
        data: {
          quantity,
          totalInput,
          totalOutput,
          totalPrice,
          version: { increment: 1 },
        },
      });
      if (!updateRes.count) throw new AppError(400, "fund_conflict_retry_failed");

      return;
    } catch (error) {
      throw error;
    }
  }

  async excelDoc(query) {
    let { reverse, sort } = query;

    try {
      reverse = reverse === "true";
      sort = allowedColumnKeys.includes(sort) ? sort : "name";

      const inventories = await prisma.inventory.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
          pricePerUnit: true,
          totalPrice: true,
          history: {
            where: { isActive: true },
            select: { type: true, quantity: true },
          },
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Inventar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getUnitUz = (unit) => {
        const units = {
          [Unit.KG]: "Килограмм",
          [Unit.M]: "Метр",
          [Unit.M2]: "Квадрат метр",
          [Unit.M3]: "Куб метр",
          [Unit.PCS]: "Дона",
          [Unit.SET]: "Тўплам",
          [Unit.TON]: "Тонна",
          [Unit.L]: "Литр",
          [Unit.UZS]: "Сўм",
          [Unit.H]: "Соат",
          [Unit.DAY]: "Кун",
          [Unit.WORK_VOLUME]: "Иш ҳажми",
          [Unit.SERVICE]: "Хизмат",
        };
        return units[unit] || unit || "-";
      };

      const formatQuantity = (num) => {
        if (!num || isNaN(Number(num))) return "0";
        const value = Number(num);
        if (Number.isInteger(value)) {
          return value.toLocaleString("uz-UZ");
        }
        return value.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
      };

      const formatNumber = (num) => {
        if (!num || isNaN(Number(num))) return "0.00";
        return Number(num).toLocaleString("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const formatAmount = (amount) => {
        const num = Number(amount) / 100;
        return formatNumber(num);
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Маҳсулот номи", key: "name", minWidth: 30 },
        { header: "Ўлчов бирлиги", key: "unit", minWidth: 16 },
        { header: "Бирлик нархи", key: "pricePerUnit", minWidth: 18 },
        { header: "Жами қўшилган", key: "totalInput", minWidth: 18 },
        { header: "Жами сарфланган", key: "totalOutput", minWidth: 18 },
        { header: "Qoldiq miqdori", key: "quantity", minWidth: 18 },
        { header: "Қолдиқ нархи", key: "totalPrice", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = inventories.map((inv, index) => {
        // INPUT va OUTPUT larni hisoblash
        let totalInput = 0;
        let totalOutput = 0;

        inv.history.forEach((h) => {
          if (h.type === InventoryHistoryType.INPUT) {
            totalInput += Number(h.quantity);
          } else if (h.type === InventoryHistoryType.OUTPUT) {
            totalOutput += Number(h.quantity);
          }
        });

        const data = {
          number: String(index + 1),
          name: inv.name || "",
          unit: getUnitUz(inv.unit),
          pricePerUnit: formatAmount(inv.pricePerUnit),
          totalInput: formatQuantity(totalInput),
          totalOutput: formatQuantity(totalOutput),
          quantity: formatQuantity(inv.quantity),
          totalPrice: formatAmount(inv.totalPrice),
          _quantity: Number(inv.quantity),
          _totalPrice: Number(inv.totalPrice),
        };

        columns.forEach((col, idx) => {
          const len = String(data[col.key]).length;
          if (len > maxLengths[idx]) {
            maxLengths[idx] = len;
          }
        });

        return data;
      });

      // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
      columns.forEach((col, idx) => {
        let width = maxLengths[idx] + 3;
        width = Math.max(width, col.minWidth || 10);
        sheet.getColumn(idx + 1).width = width;
      });

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const { _quantity, _totalPrice, ...cleanData } = data;

        const row = sheet.addRow(cleanData);
        row.height = MIN_ROW_HEIGHT;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle" }; // Mahsulot nomi
        row.getCell(3).alignment = { horizontal: "center", vertical: "middle" }; // O'lchov birligi

        // Birlik narxi
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true };

        // Jami qo'shilgan - yashil
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };

        // Jami sarflangan - qizil
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).font = { size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };

        // Qoldiq miqdori - musbat yashil, 0 yoki manfiy qizil
        row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(7).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _quantity > 0 ? "FF2E7D32" : "FFC62828" },
        };

        // Qoldiq narxi - musbat yashil, 0 yoki manfiy qizil
        row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(8).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _totalPrice > 0 ? "FF2E7D32" : "FFC62828" },
        };
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;

      // Umumiy summalar
      let grandTotalInput = 0;
      let grandTotalOutput = 0;
      let grandTotalQuantity = 0;
      let grandTotalPrice = 0;

      inventories.forEach((inv) => {
        inv.history.forEach((h) => {
          if (h.type === InventoryHistoryType.INPUT) {
            grandTotalInput += Number(h.quantity);
          } else if (h.type === InventoryHistoryType.OUTPUT) {
            grandTotalOutput += Number(h.quantity);
          }
        });
        grandTotalQuantity += Number(inv.quantity);
        grandTotalPrice += Number(inv.totalPrice);
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами маҳсулотлар: ${inventories.length} та`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      summaryRow.getCell(5).value = formatQuantity(grandTotalInput);
      summaryRow.getCell(5).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      summaryRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(6).value = formatQuantity(grandTotalOutput);
      summaryRow.getCell(6).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      summaryRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(7).value = formatQuantity(grandTotalQuantity);
      summaryRow.getCell(7).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: grandTotalQuantity > 0 ? "FF2E7D32" : "FFC62828" },
      };
      summaryRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

      summaryRow.getCell(8).value = formatAmount(grandTotalPrice);
      summaryRow.getCell(8).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: grandTotalPrice > 0 ? "FF2E7D32" : "FFC62828" },
      };
      summaryRow.getCell(8).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      throw error;
    }
  }

  async historiesExcelDoc(query) {
    let { reverse, sort, type, createdBy, executedBy, object, organization, branch, from, to, date } = query;

    try {
      // Optional print/layout params
      const orientation = "portrait";
      const paper = "A4";
      const pageBreakEvery = null; // if set, insert page break every N rows

      // === QUERY PARSING (getHistories bilan bir xil) ===
      reverse = reverse === "true";
      sort = ["createdAt", "quantity"].includes(sort) ? sort : "createdAt";
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;
      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({
          where: { isActive: true, id: Number(object) },
        }))
          ? Number(object)
          : null;
      branch =
        !Number.isNaN(Number(branch)) &&
        Number(branch) > 0 &&
        Number.isInteger(Number(branch)) &&
        (await prisma.branch.findFirst({
          where: { isActive: true, id: Number(branch) },
        }))
          ? Number(branch)
          : null;
      organization =
        !Number.isNaN(Number(organization)) &&
        Number(organization) > 0 &&
        Number.isInteger(Number(organization)) &&
        (await prisma.organization.findFirst({
          where: { isActive: true, id: Number(organization) },
        }))
          ? Number(organization)
          : null;
      createdBy =
        !Number.isNaN(Number(createdBy)) &&
        Number(createdBy) > 0 &&
        Number.isInteger(Number(createdBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(createdBy) },
        }))
          ? Number(createdBy)
          : null;
      executedBy =
        !Number.isNaN(Number(executedBy)) &&
        Number(executedBy) > 0 &&
        Number.isInteger(Number(executedBy)) &&
        (await prisma.user.findFirst({
          where: { isActive: true, id: Number(executedBy) },
        }))
          ? Number(executedBy)
          : null;

      from = !Number.isNaN(Date.parse(from)) ? new Date(from) : null;
      if (from) from.setHours(0, 0, 0, 0);
      to = !Number.isNaN(Date.parse(to)) ? new Date(to) : null;
      if (to) to.setHours(23, 59, 59, 999);

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            from = new Date(new Date().setHours(0, 0, 0, 0));
            to = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK": {
            const { startOfWeek, endOfWeek } = getWeekRange();
            from = startOfWeek;
            to = endOfWeek;
            break;
          }
          case "MONTH": {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            from = new Date(startOfMonth);
            to = new Date(endOfMonth);
            break;
          }
          case "YEAR": {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            from = new Date(startOfYear);
            to = new Date(endOfYear);
            break;
          }
        }
      }

      // === WHERE ===
      const findWhere = {
        isActive: true,
        OR: [
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
          { transactionItemId: null },
        ],
        inventory: { isActive: true },
        ...(type && { type }),
        ...(object && { objectId: object }),
        ...(branch && { branchId: branch }),
        ...(organization && { organizationId: organization }),
        ...(createdBy && { createdById: createdBy }),
        ...(executedBy && { executedById: executedBy }),
        ...((from || to) && {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      };

      // === DB ===
      const histories = await prisma.inventoryHistory.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        where: findWhere,
        include: {
          inventory: { where: { isActive: true }, include: { avatars: true } },
          object: { where: { isActive: true } },
          branch: { where: { isActive: true } },
          organization: { where: { isActive: true } },
          createdBy: { where: { isActive: true } },
          executedBy: { where: { isActive: true } },
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Histories");

      // ===== KONSTANTALAR (OVER-ESTIMATE for reliable height) =====
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 28; // points - increased to ensure enough space
      const BASE_HEIGHT = 26; // points
      const LINE_HEIGHT = 22; // points per text line (over-estimate)
      const MAX_WIDTH = 60; // excel character units
      const DEFAULT_PADDING = 3; // excel width padding
      const SAFE_MULTIPLIER = 1.35; // multiply estimated height to be safe

      // ===== per-column CHAR_WIDTH map (tweakable) =====
      const CHAR_WIDTH_MAP = {
        inventory: 0.95,
        organization: 0.9,
        object: 0.95,
        createdBy: 0.9,
        executedBy: 0.9,
        description: 0.95,
        default: 0.95,
      };

      // ===== HELPERS =====
      const getTypeUz = (t) => {
        const types = {
          [InventoryHistoryType.INPUT]: "Кирим",
          [InventoryHistoryType.OUTPUT]: "Чиқим",
        };
        return types[t] || t || "-";
      };
      const getTypeStyle = (t) => {
        const styles = {
          [InventoryHistoryType.INPUT]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [InventoryHistoryType.OUTPUT]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
        };
        return styles[t] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };
      const formatDate = (d) => {
        if (!d) return "";
        const dateObj = new Date(d);
        const day = dateObj.getDate().toString().padStart(2, "0");
        const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
        const hours = dateObj.getHours().toString().padStart(2, "0");
        const minutes = dateObj.getMinutes().toString().padStart(2, "0");
        return `${day}.${month}.${dateObj.getFullYear()} ${hours}:${minutes}`;
      };
      const formatQuantity = (num) => {
        if (num === null || num === undefined || isNaN(Number(num))) return "0";
        const value = Number(num);
        if (Number.isInteger(value)) return value.toLocaleString("uz-UZ");
        return value.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
      };
      const formatAmount = (amountMinor) => {
        if (amountMinor === null || amountMinor === undefined || isNaN(Number(amountMinor))) return /* "0.00" */ 0;
        return fromMinorUnits(Number(amountMinor)); /* .toString(); */
      };
      const getFullName = (p) => (p ? `${p.fname || ""} ${p.lname || ""}`.trim() : "-");

      // calc column width by sample text using per-column char width
      function calcColumnWidthByText(text, key, min = 10, max = MAX_WIDTH) {
        const len = String(text || "").length;
        const cw = CHAR_WIDTH_MAP[key] ?? CHAR_WIDTH_MAP.default;
        let width = Math.ceil(len * cw) + DEFAULT_PADDING;
        if (width < min) width = min;
        if (width > max) width = max;
        return width;
      }

      // word-based, over-estimate row height calculation
      function calcRowHeightByWords(text, colWidth, key) {
        if (!text) return BASE_HEIGHT;
        const cw = CHAR_WIDTH_MAP[key] ?? CHAR_WIDTH_MAP.default;
        // ensure charsPerLine not unrealistically small or huge
        const charsPerLine = Math.max(5, Math.floor(colWidth / cw));

        const words = String(text).split(/\s+/).filter(Boolean);
        let lines = 0;
        let currentLen = 0;

        for (const w of words) {
          // if a single word longer than line -> split it into parts
          if (w.length > charsPerLine) {
            // finish current line
            if (currentLen > 0) {
              lines++;
              currentLen = 0;
            }
            const extra = Math.ceil(w.length / charsPerLine);
            lines += extra;
            currentLen = 0;
          } else {
            if (currentLen === 0) {
              currentLen = w.length;
            } else if (currentLen + 1 + w.length <= charsPerLine) {
              currentLen += 1 + w.length; // +space
            } else {
              lines++;
              currentLen = w.length;
            }
          }
        }

        if (currentLen > 0) lines++;

        // apply safe multiplier and ensure minimal height
        return Math.max(MIN_ROW_HEIGHT, Math.ceil(lines * LINE_HEIGHT * SAFE_MULTIPLIER));
      }

      // ===== COLUMNS (attachments removed) =====
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Амал тури", key: "type", minWidth: 12 },
        { header: "Маҳсулот", key: "inventory", minWidth: 26, wrapText: true, maxWidth: 40 },
        { header: "Миқдор", key: "quantity", minWidth: 12 },
        {
          header: "Бирлик нархи",
          key: "pricePerUnit",
          minWidth: 14,
          style: { numFmt: "#,##0.00" },
        },
        {
          header: "Жами нарх",
          key: "totalPrice",
          minWidth: 14,
          style: { numFmt: "#,##0.00" },
        },
        { header: "Ташкилот", key: "organization", minWidth: 20, wrapText: true, maxWidth: 40 },
        { header: "Обект", key: "object", minWidth: 18, wrapText: true, maxWidth: 30 },
        { header: "Фирма", key: "branch", minWidth: 18, wrapText: true, maxWidth: 30 },
        { header: "Яратган", key: "createdBy", minWidth: 20, wrapText: true, maxWidth: 30 },
        { header: "Ишлатган", key: "executedBy", minWidth: 20, wrapText: true, maxWidth: 30 },
        { header: "Тавсиф", key: "description", minWidth: 30, wrapText: true, maxWidth: 60 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        style: c.style,
      }));

      // ===== PREPARE ROWS DATA =====
      const rowsData = histories.map((h, idx) => {
        const pricePerUnit = h.inventory?.pricePerUnit ?? null;
        const totalPriceMinor = h.inventory ? Number(pricePerUnit) * Number(h.quantity || 0) : null;

        return {
          number: String(idx + 1),
          type: getTypeUz(h.type),
          inventory: h.inventory ? h.inventory.name : "-",
          quantity: formatQuantity(h.quantity),
          pricePerUnit: pricePerUnit ? formatAmount(pricePerUnit) : "-",
          totalPrice: totalPriceMinor ? formatAmount(totalPriceMinor) : "-",
          organization: h.organization ? h.organization.organizationName : "-",
          object: h.object ? h.object.name : "-",
          branch: h.branch ? h.branch.name : "-",
          createdBy: getFullName(h.createdBy),
          executedBy: getFullName(h.executedBy),
          description: h.description || "-",
          createdAt: formatDate(h.createdAt),
          _type: h.type,
          _quantity: Number(h.quantity || 0),
        };
      });

      // ===== CALC COLUMN WIDTHS BASED ON LONGEST CELL SAMPLE =====
      const maxTexts = columns.map((col) => col.header);
      rowsData.forEach((row) => {
        columns.forEach((col, idx) => {
          const val = String(row[col.key] ?? "");
          if (val.length > (maxTexts[idx] || "").length) maxTexts[idx] = val;
        });
      });

      columns.forEach((col, idx) => {
        const sample = maxTexts[idx] ?? "";
        const preferredMax = col.maxWidth || MAX_WIDTH;
        const width = calcColumnWidthByText(sample, col.key, col.minWidth || 10, preferredMax);
        sheet.getColumn(idx + 1).width = width;
      });

      // ===== ADD ROWS & SET STYLES + PRECISE ROW HEIGHT USING WORD-BASED CALC =====
      const wrapColIndexes = columns.reduce((acc, c, i) => {
        if (c.wrapText) acc.push(i + 1);
        return acc;
      }, []);

      rowsData.forEach((d) => {
        const typeStyle = getTypeStyle(d._type);
        const { _type, _quantity, ...clean } = d;

        const row = sheet.addRow(clean);

        // base styles + borders
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // per-cell alignments and styles
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: typeStyle.bgColor } };
        row.getCell(2).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };

        row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: _type === InventoryHistoryType.INPUT ? "FF2E7D32" : "FFC62828" } };

        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

        row.getCell(7).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(9).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(10).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(11).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(12).alignment = { horizontal: "left", vertical: "middle", wrapText: true };

        row.getCell(13).alignment = { horizontal: "center", vertical: "middle" };

        // compute precise row height from wrap columns (word-based, over-estimate)
        let maxHeight = BASE_HEIGHT;
        wrapColIndexes.forEach((colIndex) => {
          const colWidth = sheet.getColumn(colIndex).width || 10;
          const cellVal = row.getCell(colIndex).value ?? "";
          const estH = calcRowHeightByWords(String(cellVal), colWidth, columns[colIndex - 1].key);
          if (estH > maxHeight) maxHeight = estH;
        });

        row.height = maxHeight;

        // optional page break every N rows (simple periodic page break)
        if (pageBreakEvery && Number.isInteger(pageBreakEvery) && pageBreakEvery > 0) {
          const rowNumber = row.number; // 1-based
          if ((rowNumber - 1) % pageBreakEvery === 0 && rowNumber !== 1) {
            row.pageBreak = true;
          }
        }
      });

      // ===== HEADER STYLE =====
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // freeze header
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      // ===== Print-ready settings (A4 + margins + orientation) =====
      sheet.pageSetup = {
        orientation: orientation === "landscape" ? "landscape" : "portrait",
        fitToPage: false,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: paper === "A4" ? 9 : 9,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
        horizontalCentered: false,
        verticalCentered: false,
      };

      // optional header/footer
      const title = `Инвентар тарихлари`;
      const nowLabel = new Date().toLocaleString("ru-RU");
      sheet.headerFooter = {
        differentFirst: false,
        oddHeader: `&C&"Arial,Bold"&16 ${title}\n&C&"Arial,Regular"&10 ${nowLabel}`,
        oddFooter: `&LGenerated by system &RPage &P of &N`,
      };

      // ===== WRITE & SEND =====
      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      throw error;
    }
  }

  async inventoryExcelDoc(id) {
    try {
      const inventory = await prisma.inventory.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
        },
      });
      if (!inventory) throw new AppError(404, "inventory_not_found");

      const [histories, grouped] = await Promise.all([
        prisma.inventoryHistory.findMany({
          orderBy: { createdAt: "desc" },
          where: {
            isActive: true,
            inventoryId: id,
            OR: [
              {
                transactionItem: {
                  is: {
                    isActive: true,
                    transaction: {
                      is: {
                        isActive: true,
                      },
                    },
                  },
                },
              },
              { transactionItemId: null },
            ],
          },
          select: {
            id: true,
            type: true,
            quantity: true,
            description: true,
            createdAt: true,
            pricePerUnit: true,
            totalPrice: true,
            organization: {
              where: { isActive: true },
              select: { organizationName: true },
            },
            createdBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            executedBy: {
              where: { isActive: true },
              select: { fname: true, lname: true },
            },
            branch: {
              where: {
                isActive: true,
              },
              select: { name: true },
            },
            object: {
              select: { name: true },
            },
          },
        }),
        prisma.inventoryHistory.groupBy({
          by: ["type"],
          _sum: { quantity: true },
          _count: true,
          where: { isActive: true, inventoryId: id },
        }),
      ]);

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(inventory.name || "Tarix");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 35;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const getTypeUz = (type) => {
        const types = {
          [InventoryHistoryType.INPUT]: "Kirim",
          [InventoryHistoryType.OUTPUT]: "Chiqim",
        };
        return types[type] || type || "-";
      };

      const getTypeStyle = (type) => {
        const styles = {
          [InventoryHistoryType.INPUT]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [InventoryHistoryType.OUTPUT]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
        };
        return styles[type] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const formatDate = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()} ${hours}:${minutes}`;
      };

      const formatQuantity = (num) => {
        if (!num || isNaN(Number(num))) return "0";
        const value = Number(num);
        if (Number.isInteger(value)) {
          return value.toLocaleString("uz-UZ");
        }
        return value.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
      };

      const getFullName = (person) => {
        if (!person) return "-";
        return `${person.fname || ""} ${person.lname || ""}`.trim() || "-";
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Амал тури", key: "type", minWidth: 12 },
        { header: "Миқдор", key: "quantity", minWidth: 14 },
        {
          header: "Бирлик нархи",
          key: "pricePerUnit",
          minWidth: 14,
          style: { numFmt: "#,##0.00" },
        },
        {
          header: "Жами нарх",
          key: "totalPrice",
          minWidth: 14,
          style: { numFmt: "#,##0.00" },
        },
        { header: "Ташкилот", key: "organization", minWidth: 14 },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Фирма", key: "branch", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратган", key: "createdBy", minWidth: 25 },
        { header: "Ишлатган", key: "executedBy", minWidth: 22 },
        { header: "Тавсиф", key: "description", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        style: col.style,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = histories.map((h, index) => {
        const data = {
          number: String(index + 1),
          type: getTypeUz(h.type),
          quantity: formatQuantity(h.quantity),
          pricePerUnit: Number(h.pricePerUnit) / 100,
          totalPrice: Number(h.totalPrice) / 100,
          organization: h.organization?.organizationName || "-",
          object: h.object?.name || "-",
          branch: h.branch?.name || "-",
          createdBy: getFullName(h.createdBy),
          executedBy: getFullName(h.executedBy),
          description: h.description || "-",
          createdAt: formatDate(h.createdAt),
          _type: h.type,
          _quantity: Number(h.quantity),
        };

        columns.forEach((col, idx) => {
          if (col.maxWidth) return;
          const len = String(data[col.key]).length;
          if (len > maxLengths[idx]) {
            maxLengths[idx] = len;
          }
        });

        return data;
      });

      // ==================== COLUMN WIDTHLARNI O'RNATISH ====================
      columns.forEach((col, idx) => {
        let width;
        if (col.maxWidth) {
          width = Math.min(maxLengths[idx] + 3, col.maxWidth);
        } else {
          width = maxLengths[idx] + 3;
        }
        width = Math.max(width, col.minWidth || 10);
        sheet.getColumn(idx + 1).width = width;
      });

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const typeStyle = getTypeStyle(data._type);
        const { _type, _quantity, ...cleanData } = data;

        const row = sheet.addRow(cleanData);
        row.height = MIN_ROW_HEIGHT;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №

        // Amal turi - rangli fon
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: typeStyle.bgColor } };
        row.getCell(2).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };

        // Miqdor - kirim yashil, chiqim qizil
        row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(3).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _type === InventoryHistoryType.INPUT ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

        row.getCell(6).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Tashkilot
        row.getCell(7).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Firma

        row.getCell(9).alignment = { horizontal: "left", vertical: "middle" }; // Yaratgan
        row.getCell(10).alignment = { horizontal: "left", vertical: "middle" }; // Ishlatgan

        row.getCell(11).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Tavsif
        row.getCell(12).alignment = { horizontal: "center", vertical: "middle" }; // Sana
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // ==================== JAMI QATOR ====================
      const summaryRowNumber = sheet.rowCount + 2;

      const inputCount = grouped.find((g) => g.type === InventoryHistoryType.INPUT)?._count || 0;
      const outputCount = grouped.find((g) => g.type === InventoryHistoryType.OUTPUT)?._count || 0;
      const inputQuantity = Number(grouped.find((g) => g.type === InventoryHistoryType.INPUT)?._sum.quantity || 0);
      const outputQuantity = Number(grouped.find((g) => g.type === InventoryHistoryType.OUTPUT)?._sum.quantity || 0);

      // Jami kirim
      const inputRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:D${summaryRowNumber}`);
      inputRow.getCell(1).value = `Жами кирим: ${inputCount} та`;
      inputRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      inputRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      inputRow.getCell(5).value = formatQuantity(inputQuantity);
      inputRow.getCell(5).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FF2E7D32" } };
      inputRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      // Jami chiqim
      const outputRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:D${summaryRowNumber + 1}`);
      outputRow.getCell(1).value = `Жами чиқим: ${outputCount} та`;
      outputRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      outputRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      outputRow.getCell(5).value = formatQuantity(outputQuantity);
      outputRow.getCell(5).font = { bold: true, size: FONT_SIZE, name: FONT_NAME, color: { argb: "FFC62828" } };
      outputRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      // Qoldiq
      const remainingRow = sheet.getRow(summaryRowNumber + 2);
      sheet.mergeCells(`A${summaryRowNumber + 2}:D${summaryRowNumber + 2}`);
      remainingRow.getCell(1).value = "Қолдиқ:";
      remainingRow.getCell(1).font = { bold: true, size: 11, name: FONT_NAME };
      remainingRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      remainingRow.getCell(5).value = formatQuantity(inventory.quantity);
      remainingRow.getCell(5).font = {
        bold: true,
        size: 12,
        name: FONT_NAME,
        color: { argb: Number(inventory.quantity) > 0 ? "FF2E7D32" : "FFC62828" },
      };
      remainingRow.getCell(5).alignment = { horizontal: "right", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      throw error;
    }
  }

  async userHistoriesExcelDoc(query, userId) {
    let { reverse, sort, type, object, organization, branch, from, to, date } = query;

    try {
      // Optional print/layout params
      const orientation = "portrait";
      const paper = "A4";
      const pageBreakEvery = null; // if set, insert page break every N rows

      // === QUERY PARSING (getHistories bilan bir xil) ===
      reverse = reverse === "true";
      sort = ["createdAt", "quantity"].includes(sort) ? sort : "createdAt";
      type = Object.values(InventoryHistoryType).includes(type) ? type : null;
      object =
        !Number.isNaN(Number(object)) &&
        Number(object) > 0 &&
        Number.isInteger(Number(object)) &&
        (await prisma.object.findFirst({
          where: { isActive: true, id: Number(object) },
        }))
          ? Number(object)
          : null;
      branch =
        !Number.isNaN(Number(branch)) &&
        Number(branch) > 0 &&
        Number.isInteger(Number(branch)) &&
        (await prisma.branch.findFirst({
          where: { isActive: true, id: Number(branch) },
        }))
          ? Number(branch)
          : null;
      organization =
        !Number.isNaN(Number(organization)) &&
        Number(organization) > 0 &&
        Number.isInteger(Number(organization)) &&
        (await prisma.organization.findFirst({
          where: { isActive: true, id: Number(organization) },
        }))
          ? Number(organization)
          : null;

      from = !Number.isNaN(Date.parse(from)) ? new Date(from) : null;
      if (from) from.setHours(0, 0, 0, 0);
      to = !Number.isNaN(Date.parse(to)) ? new Date(to) : null;
      if (to) to.setHours(23, 59, 59, 999);

      if (["TODAY", "WEEK", "MONTH", "YEAR"].includes(date)) {
        const now = new Date();
        switch (date) {
          case "TODAY":
            from = new Date(new Date().setHours(0, 0, 0, 0));
            to = new Date(new Date().setHours(23, 59, 59, 999));
            break;
          case "WEEK": {
            const { startOfWeek, endOfWeek } = getWeekRange();
            from = startOfWeek;
            to = endOfWeek;
            break;
          }
          case "MONTH": {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            from = new Date(startOfMonth);
            to = new Date(endOfMonth);
            break;
          }
          case "YEAR": {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            from = new Date(startOfYear);
            to = new Date(endOfYear);
            break;
          }
        }
      }

      // === WHERE ===
      const findWhere = {
        isActive: true,
        OR: [{ createdById: userId }, { executedById: userId }],
        OR: [
          {
            transactionItem: {
              is: {
                isActive: true,
                transaction: {
                  is: {
                    isActive: true,
                  },
                },
              },
            },
          },
          { transactionItemId: null },
        ],
        inventory: { isActive: true },
        ...(type && { type }),
        ...(object && { objectId: object }),
        ...(branch && { branchId: branch }),
        ...(organization && { organizationId: organization }),
        ...((from || to) && {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      };

      // === DB ===
      const histories = await prisma.inventoryHistory.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        where: findWhere,
        include: {
          inventory: { where: { isActive: true }, include: { avatars: true } },
          object: { where: { isActive: true } },
          branch: { where: { isActive: true } },
          organization: { where: { isActive: true } },
          createdBy: { where: { isActive: true } },
          executedBy: { where: { isActive: true } },
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Histories");

      // ===== KONSTANTALAR (OVER-ESTIMATE for reliable height) =====
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const MIN_ROW_HEIGHT = 28; // points - increased to ensure enough space
      const BASE_HEIGHT = 26; // points
      const LINE_HEIGHT = 22; // points per text line (over-estimate)
      const MAX_WIDTH = 60; // excel character units
      const DEFAULT_PADDING = 3; // excel width padding
      const SAFE_MULTIPLIER = 1.35; // multiply estimated height to be safe

      // ===== per-column CHAR_WIDTH map (tweakable) =====
      const CHAR_WIDTH_MAP = {
        inventory: 0.95,
        organization: 0.9,
        object: 0.95,
        createdBy: 0.9,
        executedBy: 0.9,
        description: 0.95,
        default: 0.95,
      };

      // ===== HELPERS =====
      const getTypeUz = (t) => {
        const types = {
          [InventoryHistoryType.INPUT]: "Кирим",
          [InventoryHistoryType.OUTPUT]: "Чиқим",
        };
        return types[t] || t || "-";
      };
      const getTypeStyle = (t) => {
        const styles = {
          [InventoryHistoryType.INPUT]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [InventoryHistoryType.OUTPUT]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
        };
        return styles[t] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };
      const formatDate = (d) => {
        if (!d) return "";
        const dateObj = new Date(d);
        const day = dateObj.getDate().toString().padStart(2, "0");
        const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
        const hours = dateObj.getHours().toString().padStart(2, "0");
        const minutes = dateObj.getMinutes().toString().padStart(2, "0");
        return `${day}.${month}.${dateObj.getFullYear()} ${hours}:${minutes}`;
      };
      const formatQuantity = (num) => {
        if (num === null || num === undefined || isNaN(Number(num))) return "0";
        const value = Number(num);
        if (Number.isInteger(value)) return value.toLocaleString("uz-UZ");
        return value.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
      };
      const formatAmount = (amountMinor) => {
        if (amountMinor === null || amountMinor === undefined || isNaN(Number(amountMinor))) return /* "0.00" */ 0;
        return fromMinorUnits(Number(amountMinor)); /* .toString(); */
      };
      const getFullName = (p) => (p ? `${p.fname || ""} ${p.lname || ""}`.trim() : "-");

      // calc column width by sample text using per-column char width
      function calcColumnWidthByText(text, key, min = 10, max = MAX_WIDTH) {
        const len = String(text || "").length;
        const cw = CHAR_WIDTH_MAP[key] ?? CHAR_WIDTH_MAP.default;
        let width = Math.ceil(len * cw) + DEFAULT_PADDING;
        if (width < min) width = min;
        if (width > max) width = max;
        return width;
      }

      // word-based, over-estimate row height calculation
      function calcRowHeightByWords(text, colWidth, key) {
        if (!text) return BASE_HEIGHT;
        const cw = CHAR_WIDTH_MAP[key] ?? CHAR_WIDTH_MAP.default;
        // ensure charsPerLine not unrealistically small or huge
        const charsPerLine = Math.max(5, Math.floor(colWidth / cw));

        const words = String(text).split(/\s+/).filter(Boolean);
        let lines = 0;
        let currentLen = 0;

        for (const w of words) {
          // if a single word longer than line -> split it into parts
          if (w.length > charsPerLine) {
            // finish current line
            if (currentLen > 0) {
              lines++;
              currentLen = 0;
            }
            const extra = Math.ceil(w.length / charsPerLine);
            lines += extra;
            currentLen = 0;
          } else {
            if (currentLen === 0) {
              currentLen = w.length;
            } else if (currentLen + 1 + w.length <= charsPerLine) {
              currentLen += 1 + w.length; // +space
            } else {
              lines++;
              currentLen = w.length;
            }
          }
        }

        if (currentLen > 0) lines++;

        // apply safe multiplier and ensure minimal height
        return Math.max(MIN_ROW_HEIGHT, Math.ceil(lines * LINE_HEIGHT * SAFE_MULTIPLIER));
      }

      // ===== COLUMNS (attachments removed) =====
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Амал тури", key: "type", minWidth: 12 },
        { header: "Маҳсулот", key: "inventory", minWidth: 26, wrapText: true, maxWidth: 40 },
        { header: "Миқдор", key: "quantity", minWidth: 12 },
        {
          header: "Бирлик нархи",
          key: "pricePerUnit",
          minWidth: 14,
          style: { numFmt: "#,##0.00" },
        },
        {
          header: "Жами нарх",
          key: "totalPrice",
          minWidth: 14,
          style: { numFmt: "#,##0.00" },
        },
        { header: "Ташкилот", key: "organization", minWidth: 20, wrapText: true, maxWidth: 40 },
        { header: "Обект", key: "object", minWidth: 18, wrapText: true, maxWidth: 30 },
        { header: "Фирма", key: "branch", minWidth: 18, wrapText: true, maxWidth: 30 },
        { header: "Яратган", key: "createdBy", minWidth: 20, wrapText: true, maxWidth: 30 },
        { header: "Ишлатган", key: "executedBy", minWidth: 20, wrapText: true, maxWidth: 30 },
        { header: "Тавсиф", key: "description", minWidth: 30, wrapText: true, maxWidth: 60 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((c) => ({
        header: c.header,
        key: c.key,
        style: c.style,
      }));

      // ===== PREPARE ROWS DATA =====
      const rowsData = histories.map((h, idx) => {
        const pricePerUnit = h.inventory?.pricePerUnit ?? null;
        const totalPriceMinor = h.inventory ? Number(pricePerUnit) * Number(h.quantity || 0) : null;

        return {
          number: String(idx + 1),
          type: getTypeUz(h.type),
          inventory: h.inventory ? h.inventory.name : "-",
          quantity: formatQuantity(h.quantity),
          pricePerUnit: pricePerUnit ? formatAmount(pricePerUnit) : "-",
          totalPrice: totalPriceMinor ? formatAmount(totalPriceMinor) : "-",
          organization: h.organization ? h.organization.organizationName : "-",
          object: h.object ? h.object.name : "-",
          branch: h.branch ? h.branch.name : "-",
          createdBy: getFullName(h.createdBy),
          executedBy: getFullName(h.executedBy),
          description: h.description || "-",
          createdAt: formatDate(h.createdAt),
          _type: h.type,
          _quantity: Number(h.quantity || 0),
        };
      });

      // ===== CALC COLUMN WIDTHS BASED ON LONGEST CELL SAMPLE =====
      const maxTexts = columns.map((col) => col.header);
      rowsData.forEach((row) => {
        columns.forEach((col, idx) => {
          const val = String(row[col.key] ?? "");
          if (val.length > (maxTexts[idx] || "").length) maxTexts[idx] = val;
        });
      });

      columns.forEach((col, idx) => {
        const sample = maxTexts[idx] ?? "";
        const preferredMax = col.maxWidth || MAX_WIDTH;
        const width = calcColumnWidthByText(sample, col.key, col.minWidth || 10, preferredMax);
        sheet.getColumn(idx + 1).width = width;
      });

      // ===== ADD ROWS & SET STYLES + PRECISE ROW HEIGHT USING WORD-BASED CALC =====
      const wrapColIndexes = columns.reduce((acc, c, i) => {
        if (c.wrapText) acc.push(i + 1);
        return acc;
      }, []);

      rowsData.forEach((d) => {
        const typeStyle = getTypeStyle(d._type);
        const { _type, _quantity, ...clean } = d;

        const row = sheet.addRow(clean);

        // base styles + borders
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { vertical: "middle" };
        });

        // per-cell alignments and styles
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: typeStyle.bgColor } };
        row.getCell(2).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: typeStyle.fontColor } };

        row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: _type === InventoryHistoryType.INPUT ? "FF2E7D32" : "FFC62828" } };

        row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };

        row.getCell(7).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(9).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(10).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(11).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(12).alignment = { horizontal: "left", vertical: "middle", wrapText: true };

        row.getCell(13).alignment = { horizontal: "center", vertical: "middle" };

        // compute precise row height from wrap columns (word-based, over-estimate)
        let maxHeight = BASE_HEIGHT;
        wrapColIndexes.forEach((colIndex) => {
          const colWidth = sheet.getColumn(colIndex).width || 10;
          const cellVal = row.getCell(colIndex).value ?? "";
          const estH = calcRowHeightByWords(String(cellVal), colWidth, columns[colIndex - 1].key);
          if (estH > maxHeight) maxHeight = estH;
        });

        row.height = maxHeight;

        // optional page break every N rows (simple periodic page break)
        if (pageBreakEvery && Number.isInteger(pageBreakEvery) && pageBreakEvery > 0) {
          const rowNumber = row.number; // 1-based
          if ((rowNumber - 1) % pageBreakEvery === 0 && rowNumber !== 1) {
            row.pageBreak = true;
          }
        }
      });

      // ===== HEADER STYLE =====
      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // freeze header
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      // ===== Print-ready settings (A4 + margins + orientation) =====
      sheet.pageSetup = {
        orientation: orientation === "landscape" ? "landscape" : "portrait",
        fitToPage: false,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: paper === "A4" ? 9 : 9,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
        horizontalCentered: false,
        verticalCentered: false,
      };

      // optional header/footer
      const title = `Инвентар тарихлари`;
      const nowLabel = new Date().toLocaleString("ru-RU");
      sheet.headerFooter = {
        differentFirst: false,
        oddHeader: `&C&"Arial,Bold"&16 ${title}\n&C&"Arial,Regular"&10 ${nowLabel}`,
        oddFooter: `&LGenerated by system &RPage &P of &N`,
      };

      // ===== WRITE & SEND =====
      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new inventoryService();
