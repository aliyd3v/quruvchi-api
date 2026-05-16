const { TaskStatus, Unit, TaskPriority, Role } = require("../generated/prisma");
const prisma = require("../lib/prisma");
const ExcelJS = require("exceljs");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const fileService = require("../services/file.service");
const sleep = require("../utils/sleep");
const { fromMinorUnits } = require("../utils/amount");
const callService = require("../services/call.service");
const storage = require("../lib/storage");

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
  return units[unit] || "Дона";
};

async function createTaskHistoryOptimistic({ taskId, quantityOfCompleted, description, createdById, maxRetries = 3 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const task = await tx.task.findFirst({
          where: {
            id: taskId,
            parentId: { not: null },
          },
          include: {
            assigned: true,
          },
        });
        if (!task) throw new AppError(404, "task_not_found");
        if (!task.isActive) throw new AppError(400, "task_is_deleted");

        if (!task.assigned.some((a) => a.userId === createdById)) {
          throw new AppError(400, "you_are_not_assigned_to_this_task");
        }

        const parentTask = await tx.task.findUnique({
          where: { id: task.parentId },
        });
        if (!parentTask) throw new AppError(404, "task_not_found");
        if (!parentTask.isActive) throw new AppError(400, "task_is_deleted");
        if (task.status === "PENDING") throw new AppError(400, "task_is_not_started_please_before_start_the_task");

        const version = task.version;
        const newQuantityOfCompleted = Number(task.quantityOfCompleted) + Number(quantityOfCompleted);
        let status = task.status;

        const nowMs = Date.now();

        if (Number(task.quantity) === Number(newQuantityOfCompleted) || Number(task.quantity) < Number(newQuantityOfCompleted)) {
          status = TaskStatus.CHECKING;
        } else if (Number(task.quantity) > Number(newQuantityOfCompleted)) {
          status = "COMPLETED_PARTIALLY";
        }

        const updateRes = await tx.task.updateMany({
          where: { version, id: taskId },
          data: {
            quantityOfCompleted: newQuantityOfCompleted,
            status,
            version: { increment: 1 },
          },
        });
        if (updateRes.count === 0) throw new Error("VERSION_MISMATCH");

        const parentVersion = parentTask.version;
        let parentStatus = parentTask.status;

        const subtasks = await tx.task.findMany({
          where: {
            parentId: parentTask.id,
            isActive: true,
          },
        });

        const allCompleted = subtasks.every((t) => t.status === "COMPLETED");
        const allChecking = subtasks.every((t) => t.status === "COMPLETED" || t.status === "CHECKING");
        const anyInProgress = subtasks.some((t) => t.status === "IN_PROGRESS" || t.status === "COMPLETED_PARTIALLY");
        const isLate = new Date(parentTask.endDate).getTime() < nowMs;

        if (allCompleted) parentStatus = "COMPLETED";
        else if (allChecking) parentStatus = "CHECKING";
        else if (isLate) parentStatus = "LATE";
        else if (anyInProgress) parentStatus = "IN_PROGRESS";

        const updateParentRes = await tx.task.updateMany({
          where: {
            version: parentVersion,
            id: parentTask.id,
          },
          data: {
            status: parentStatus,
            version: { increment: 1 },
          },
        });
        if (updateParentRes.count === 0) throw new Error("VERSION_MISMATCH");

        const taskHistory = await tx.taskHistory.create({
          data: {
            description,
            createdById,
            quantityOfCompleted,
            taskId,
          },
          select: { id: true },
        });

        return taskHistory.id;
      });

      return result;
    } catch (err) {
      if (String(err.message).includes("VERSION_MISMATCH")) {
        if (attempt >= maxRetries) throw new AppError(400, "fund_conflict_retry_failed");
        const backoff = 50 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 50);
        await sleep(backoff + jitter);
        continue;
      } else {
        throw err;
      }
    }
  }
  throw new AppError(400, "failed_to_create_task_history");
}

async function deleteOneTaskHistoryOptimistic({ id, createdById, role, maxRetries = 3 } = {}) {
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      await prisma.$transaction(async (tx) => {
        const taskHistory = await tx.taskHistory.findUnique({
          where: { id: id },
          include: {
            task: true,
          },
        });
        if (!taskHistory) throw new AppError(404, "task_history_not_found");
        if (!taskHistory.isActive) throw new AppError(400, "task_history_is_deleted");
        if (!taskHistory.task.isActive) throw new AppError(400, "task_is_deleted");

        const task = taskHistory.task;

        if (taskHistory.createdById !== createdById && role !== Role.SUPERADMIN) {
          throw new AppError(400, "no_access");
        }

        const version = task.version;
        const newQuantityOfCompleted = Number(task.quantityOfCompleted) - Number(taskHistory.quantityOfCompleted);
        let status = task.status;

        const nowMs = Date.now();

        if (new Date(task.startDate).getTime() > nowMs) {
          if (task.quantity !== null) {
            if (Number(task.quantity) <= newQuantityOfCompleted) {
              status = "CHECKING";
            } else if (Number(task.quantity) > newQuantityOfCompleted && newQuantityOfCompleted !== 0) {
              status = "COMPLETED_PARTIALLY";
            } else {
              status = "IN_PROGRESS";
            }
          } else {
            status = "IN_PROGRESS";
          }
        } else if (new Date(task.startDate).getTime() < nowMs && new Date(task.endDate).getTime() > nowMs) {
          if (task.quantity !== null) {
            if (Number(task.quantity) <= newQuantityOfCompleted) {
              status = "CHECKING";
            } else if (Number(task.quantity) > newQuantityOfCompleted && newQuantityOfCompleted !== 0) {
              status = "COMPLETED_PARTIALLY";
            } else {
              status = "IN_PROGRESS";
            }
          } else {
            status = "IN_PROGRESS";
          }
        } else {
          if (task.quantity !== null) {
            if (Number(task.quantity) <= newQuantityOfCompleted) {
              status = "CHECKING";
            } else {
              status = "IN_PROGRESS";
            }
          } else {
            status = "IN_PROGRESS";
          }
        }

        const updateRes = await tx.task.updateMany({
          where: { version, id: task.id },
          data: {
            quantityOfCompleted: newQuantityOfCompleted,
            status,
            version: { increment: 1 },
          },
        });
        if (updateRes.count === 0) throw new Error("VERSION_MISMATCH");

        await tx.taskHistory.update({
          where: { id },
          data: { isActive: false },
        });

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
  throw new AppError(400, "task_history_delete_retry_failed");
}

const taskController = {
  async createOne(req, res, next) {
    try {
      let {
        body: { object_id: objectId = null, assigned = [], startDate, endDate, productName, quantity, technicalParameters, unit, pricePerUnit, title, description, priority, isOfficeTask },
        user: { id: createdById },
      } = req;

      if (
        objectId &&
        !(await prisma.object.findFirst({
          where: { id: objectId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw new AppError(404, "object_not_found");
      }

      const assignedResult = (
        await prisma.user.findMany({
          where: {
            id: { in: assigned },
            isActive: true,
            role: { not: "SUPERADMIN" },
          },
          select: { id: true, phone: true },
        })
      ).map((u) => ({
        id: u.id,
        phone: u.phone,
      }));

      productName = typeof productName === "string" ? productName.trim() : "";
      quantity = !Number.isNaN(Number(quantity)) && Number(req.body.quantity) > 0 ? Number(quantity) : null;
      technicalParameters = typeof technicalParameters === "string" ? technicalParameters.trim() : "";
      unit = Object.values(Unit).includes(unit) ? unit : null;
      pricePerUnit = !Number.isNaN(Number(pricePerUnit)) && Number(pricePerUnit) > 0 ? BigInt(Math.floor(Number(pricePerUnit) * 100)) : null;
      const status = endDate.getTime() <= Date.now() ? TaskStatus.LATE : TaskStatus.PENDING;
      const totalPrice = pricePerUnit !== null && quantity !== null ? BigInt(Math.floor(quantity * Number(pricePerUnit))) : null;

      await prisma.$transaction(async (tx) => {
        const newTask = await tx.task.create({
          data: {
            title,
            description,
            objectId,
            startDate,
            endDate,
            priority,
            createdById,
            progress: 0,
            status,
            productName,
            quantity,
            technicalParameters,
            unit,
            pricePerUnit,
            totalPrice,
            ...(isOfficeTask && { isOfficeTask }),
          },
        });

        if (assignedResult.length > 0) {
          await tx.taskAssignment.createMany({
            data: assignedResult.map((user) => ({ taskId: newTask.id, userId: user.id })),
          });
        }
      });

      const d = new Date();
      const currentUTCHour = d.getUTCHours();
      if (currentUTCHour > 4 && currentUTCHour < 15) {
        await Promise.all(assignedResult.map(async (u) => await callService.call(u.phone, "NEW_TASK")));
      } else {
        await prisma.callEvent.createMany({
          data: assignedResult.map((a) => ({
            type: "NEW_TASK",
            userId: a.id,
          })),
        });
      }

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createOneSubTask(req, res, next) {
    try {
      const id = idChecker(req.body.task_id);
      if (!id) throw new AppError(400, "task_id_is_required");

      let {
        body: {
          assigned,
          startDate,
          endDate,
          productName,
          quantity,
          technicalParameters,
          unit,
          pricePerUnit,
          title,
          description,
          priority,
          organizationId,
          clientId,
          deliveryAddress,
          contractNumber,
          contractDate,
        },
        user: { id: createdById },
        files,
      } = req;

      const task = await prisma.task.findFirst({
        where: { isActive: true, parentId: null, id },
        select: {
          id: true,
          subtasks: {
            where: { isActive: true },
            select: { id: true, status: true },
          },
        },
      });
      if (!task) throw new AppError(404, "task_not_found");

      if (organizationId) {
        const organization = await prisma.organization.findFirst({
          where: { isActive: true, id: organizationId },
          select: { id: true },
        });
        if (!organization) throw new AppError(404, "organization_not_found");
      }

      if (clientId) {
        const client = await prisma.organization.findFirst({
          where: { isActive: true, id: clientId },
          select: { id: true },
        });
        if (!client) throw new AppError(404, "client_not_found");
      }

      const assignedResult = (
        await prisma.user.findMany({
          where: { id: { in: assigned }, isActive: true, role: { not: "SUPERADMIN" }, tasks: { some: { taskId: id } } },
          select: { id: true },
        })
      ).map((u) => u.id);

      const totalPrice = pricePerUnit ? BigInt(Math.floor(quantity * Number(pricePerUnit))) : null;

      await prisma.$transaction(async (tx) => {
        const newSubTask = await tx.task.create({
          data: {
            parentId: id,
            title,
            description,
            startDate,
            endDate,
            priority,
            createdById,
            progress: 0,
            productName,
            quantity,
            technicalParameters,
            unit,
            pricePerUnit,
            totalPrice,
            deliveryAddress,
            contractNumber,
            contractDate,
            organizationId,
            clientId,
          },
        });

        await tx.taskAssignment.createMany({
          data: assignedResult.map((userId) => ({
            taskId: newSubTask.id,
            userId,
          })),
        });

        const parentTask = await tx.task.findFirst({
          where: { isActive: true, parentId: null, id },
          include: {
            subtasks: {
              where: { isActive: true },
              select: { id: true, status: true },
            },
          },
        });

        const countSubTasksInParentTask = parentTask.subtasks.length;
        const countComplatedSubTasksInParentTask = parentTask.subtasks.reduce((sum, t) => (t.status === TaskStatus.COMPLETED ? sum + 1 : sum + 0), 0);
        const resultPercent = Math.floor((countComplatedSubTasksInParentTask * 100) / countSubTasksInParentTask);

        let newStatus = parentTask.status;
        if (parentTask.endDate.getTime() < Date.now()) {
          newStatus = "LATE";
        } else {
          if (parentTask.subtasks.some((t) => ["IN_PROGRESS", "CHECKING", "COMPLETED_PARTIALLY", "COMPLETED"].includes(t.status))) {
            newStatus = "IN_PROGRESS";
          } else if (parentTask.subtasks.every((t) => t.status === "PENDING")) {
            newStatus = "PENDING";
          }
        }

        await tx.task.update({
          where: { id },
          data: {
            progress: resultPercent,
            status: newStatus,
          },
        });

        if (Array.isArray(files) && files.length) {
          const uploaded = await storage.deleteMany(req.files);

          if (uploaded.length) {
            const attachmentData = uploaded.map((u) => ({
              taskId: newSubTask.id,
              url: u.url,
              originalname: u.originalname,
              filename: u.filename,
              mimeType: u.mimeType,
              filesize: u.size,
              createdById,
            }));

            await tx.attachment.createMany({
              data: attachmentData,
            });
          }
        }

        return;
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let { status, page, limit, key, assigned } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;
      status = Object.values(TaskStatus).includes(status) ? status : null;

      assigned =
        !Number.isNaN(Number(assigned)) &&
        Number(assigned) > 0 &&
        (await prisma.user.findFirst({
          where: {
            id: assigned,
            isActive: true,
            role: { not: "SUPERADMIN" },
          },
          select: { id: true },
        }))
          ? Number(assigned)
          : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        isOfficeTask: false,
        ...(status && { status }),
        ...(assigned && { assigned: { some: { userId: assigned } } }),
        ...(key && {
          OR: [{ title: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }, { productName: { contains: key, mode: "insensitive" } }],
        }),
      };

      const count = await prisma.task.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [tasks, totalsRes] = await Promise.all([
        prisma.task.findMany({
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            startDate: true,
            endDate: true,
            priority: true,
            progress: true,
            isOfficeTask: true,
            productName: true,
            quantity: true,
            technicalParameters: true,
            unit: true,
            pricePerUnit: true,
            totalPrice: true,
            _count: {
              select: {
                subtasks: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
            subtasks: {
              where: { isActive: true },
              select: {
                id: true,
                comments: {
                  where: { isActive: true },
                  select: {
                    id: true,
                  },
                },
              },
            },
            object: {
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
            assigned: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    phone: true,
                    email: true,
                    role: true,
                    avatar: true,
                  },
                },
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.task.groupBy({ by: ["status"], _count: true, where: { isActive: true, parentId: null, isOfficeTask: false } }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, LATE: 0 };
      for (const g of totalsRes) {
        totals[g.status] = g._count;
        totals.ALL = totals.ALL + g._count;
      }

      const result = tasks.map((task) => {
        let timeProgress = 0;
        const subtasksCount = task._count.subtasks;
        delete tasks._count;
        const startDateMs = task.startDate.getTime();
        const endDateMs = task.endDate.getTime();
        const nowMs = Date.now();
        if (startDateMs < nowMs) {
          if (endDateMs < nowMs) {
            timeProgress = 100;
          } else {
            const differentStartWithEnd = endDateMs - startDateMs;
            const differentStartWithNow = nowMs - startDateMs;
            timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
          }
        }
        const commentsCount = task.subtasks.reduce((sum, subTask) => sum + subTask.comments.length, 0);

        return {
          ...task,
          pricePerUnit: task.pricePerUnit !== null && Number(task.pricePerUnit) > 0 ? Number(task.pricePerUnit) / 100 : null,
          totalPrice: task.totalPrice !== null && Number(task.totalPrice) > 0 ? Number(task.totalPrice) / 100 : null,
          subtasksCount,
          timeProgress,
          commentsCount,
        };
      });

      res.status(200).json({
        status: "success",
        totals,
        totalCount: count,
        page,
        totalPage,
        limit,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      let { status, assigned } = req.query;

      assigned = !Number.isNaN(Number(assigned)) && Number(assigned) > 0 && Number.isInteger(Number(assigned)) ? Number(assigned) : null;
      status = Object.values(TaskStatus).includes(status) ? status : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        isOfficeTask: false,
        ...(status && { status }),
      };

      if (assigned) {
        const userId =
          (
            await prisma.user.findFirst({
              where: {
                id: assigned,
                isActive: true,
                role: { not: "SUPERADMIN" },
              },
              select: { id: true },
            })
          )?.id || null;
        if (userId) {
          findWhere.assigned = { some: { userId } };
        }
      }

      const tasks = await prisma.task.findMany({
        where: findWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          startDate: true,
          endDate: true,
          checked: true,
          priority: true,
          status: true,
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true },
          },
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Vazifalar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.5;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 45;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }
          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getStatusStyle = (status) => {
        const styles = {
          [TaskStatus.COMPLETED]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [TaskStatus.COMPLETED_PARTIALLY]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [TaskStatus.CHECKING]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [TaskStatus.IN_PROGRESS]: { bgColor: "FFE1F5FE", fontColor: "FF0288D1" },
          [TaskStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
          [TaskStatus.PENDING]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [TaskStatus.CHECKING]: "Текширилмоқда",
          [TaskStatus.COMPLETED]: "Бажарилган",
          [TaskStatus.COMPLETED_PARTIALLY]: "Қисман бажарилган",
          [TaskStatus.IN_PROGRESS]: "Жараёнда",
          [TaskStatus.LATE]: "Кечиккан",
          [TaskStatus.PENDING]: "Бошланмаган",
        };
        return statuses[status] || "";
      };

      const getPriorityUz = (priority) => {
        const priorities = {
          [TaskPriority.LOW]: "Паст",
          [TaskPriority.MEDIUM]: "Ўрта",
          [TaskPriority.HIGH]: "Юқори",
        };
        return priorities[priority] || "-";
      };

      const getPriorityStyle = (priority) => {
        const styles = {
          [TaskPriority.LOW]: { fontColor: "FF4CAF50" },
          [TaskPriority.MEDIUM]: { fontColor: "FFFFC107" },
          [TaskPriority.HIGH]: { fontColor: "FFF44336" },
        };
        return styles[priority] || { fontColor: "FF000000" };
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

      const formatDateOnly = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Сарлавҳа", key: "title", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Тавсиф", key: "description", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Ҳолат", key: "status", minWidth: 18 },
        { header: "Муҳимлик", key: "priority", minWidth: 12 },
        { header: "Текширилган", key: "checked", minWidth: 14 },
        { header: "Бошланиш/Тугаш", key: "dates", maxWidth: 14 },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратувчи", key: "createdBy", minWidth: 24 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = tasks.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const data = {
          number: String(index + 1),
          title: t.title || "",
          description: t.description || "",
          status: getStatusUz(t.status),
          priority: getPriorityUz(t.priority),
          checked: t.checked ? "Ҳа" : "Йўқ",
          dates: formatDateOnly(t.startDate) + " " + formatDateOnly(t.endDate),
          object: t.object?.name || "-",
          createdBy: createdByName || "-",
          createdAt: formatDate(t.createdAt),
          _status: t.status,
          _priority: t.priority,
          _checked: t.checked,
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

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const priorityStyle = getPriorityStyle(data._priority);
        const { _status, _priority, _checked, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Sarlavha
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Tavsif

        // Holat - rangli fon
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        // Muhimlik - rangli matn
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: priorityStyle.fontColor } };

        // Tekshirilgan - rangli
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(6).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _checked ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Boshlanish/Tugash
        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Yaratuvchi
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan sana
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

      // Status bo'yicha hisoblash
      const statusCounts = {
        [TaskStatus.PENDING]: 0,
        [TaskStatus.IN_PROGRESS]: 0,
        [TaskStatus.CHECKING]: 0,
        [TaskStatus.COMPLETED_PARTIALLY]: 0,
        [TaskStatus.COMPLETED]: 0,
        [TaskStatus.LATE]: 0,
      };
      tasks.forEach((t) => {
        statusCounts[t.status]++;
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами вазифалар: ${tasks.length}`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Status statistikasi
      const statsRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:D${summaryRowNumber + 1}`);
      statsRow.getCell(1).value =
        `Bajarilgan: ${statusCounts[TaskStatus.COMPLETED]} | Текширилмоқда: ${statusCounts[TaskStatus.CHECKING]} | Жараёнда: ${statusCounts[TaskStatus.IN_PROGRESS]} | Кечиккан: ${statusCounts[TaskStatus.LATE]}`;
      statsRow.getCell(1).font = { size: FONT_SIZE, name: FONT_NAME };
      statsRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAllOfficeTasks(req, res, next) {
    try {
      let { status, page, limit, key, assigned } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      key = typeof key === "string" ? key.trim() : null;
      status = Object.values(TaskStatus).includes(status) ? status : null;
      assigned = !Number.isNaN(Number(assigned)) && Number(assigned) && Number.isInteger(Number(assigned)) > 0 ? Number(assigned) : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        isOfficeTask: true,
        ...(key && { OR: [{ title: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }, { productName: { contains: key, mode: "insensitive" } }] }),
      };

      if (assigned) {
        const userId =
          (
            await prisma.user.findFirst({
              where: {
                id: assigned,
                isActive: true,
                role: { not: "SUPERADMIN" },
              },
              select: { id: true },
            })
          )?.id || null;
        if (userId) {
          findWhere.assigned = { some: { userId } };
        }
      }

      const count = await prisma.task.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [tasks, totalsRes] = await Promise.all([
        prisma.task.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            startDate: true,
            endDate: true,
            priority: true,
            progress: true,
            isOfficeTask: true,
            productName: true,
            quantity: true,
            technicalParameters: true,
            unit: true,
            pricePerUnit: true,
            totalPrice: true,
            _count: {
              select: {
                subtasks: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
            subtasks: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                comments: {
                  where: {
                    isActive: true,
                  },
                  select: {
                    id: true,
                  },
                },
              },
            },
            object: {
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
            assigned: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    phone: true,
                    email: true,
                    role: true,
                    avatar: true,
                  },
                },
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.task.groupBy({
          by: ["status"],
          _count: true,
          where: {
            isOfficeTask: true,
            isActive: true,
            parentId: null,
          },
        }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, LATE: 0 };

      for (const g of totalsRes) {
        totals[g.status] = g._count;
        totals.ALL = totals.ALL + g._count;
      }

      const result = tasks.map((task) => {
        let timeProgress = 0;
        const subtasksCount = task._count.subtasks;
        delete tasks._count;
        const startDateMs = task.startDate.getTime();
        const endDateMs = task.endDate.getTime();
        const nowMs = Date.now();
        if (startDateMs < nowMs) {
          if (endDateMs < nowMs) timeProgress = 100;
          else {
            const differentStartWithEnd = endDateMs - startDateMs;
            const differentStartWithNow = nowMs - startDateMs;
            timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
          }
        }
        const commentsCount = task.subtasks.reduce((sum, subTask) => sum + subTask.comments.length, 0);

        return { ...task, subtasksCount, timeProgress, commentsCount };
      });

      res.status(200).json({
        status: "success",
        totals,
        totalCount: count,
        page,
        totalPage,
        limit,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOfficeTasksExcelDoc(req, res, next) {
    try {
      let { status, assigned } = req.query;

      assigned = !Number.isNaN(Number(assigned)) && Number(assigned) && Number.isInteger(Number(assigned)) > 0 ? Number(assigned) : null;
      status = Object.values(TaskStatus).includes(status) ? status : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        isOfficeTask: true,
        ...(status && { status }),
      };

      if (assigned) {
        const userId =
          (
            await prisma.user.findFirst({
              where: {
                id: assigned,
                isActive: true,
                role: { not: "SUPERADMIN" },
              },
              select: { id: true },
            })
          )?.id || null;
        if (userId) {
          findWhere.assigned = { some: { userId } };
        }
      }

      const tasks = await prisma.task.findMany({
        where: findWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          startDate: true,
          endDate: true,
          checked: true,
          priority: true,
          status: true,
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true },
          },
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Vazifalar");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.5;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 45;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }
          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getStatusStyle = (status) => {
        const styles = {
          [TaskStatus.COMPLETED]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [TaskStatus.COMPLETED_PARTIALLY]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [TaskStatus.CHECKING]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [TaskStatus.IN_PROGRESS]: { bgColor: "FFE1F5FE", fontColor: "FF0288D1" },
          [TaskStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
          [TaskStatus.PENDING]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [TaskStatus.CHECKING]: "Текширилмоқда",
          [TaskStatus.COMPLETED]: "Бажарилган",
          [TaskStatus.COMPLETED_PARTIALLY]: "Қисман бажарилган",
          [TaskStatus.IN_PROGRESS]: "Жараёнда",
          [TaskStatus.LATE]: "Кечиккан",
          [TaskStatus.PENDING]: "Бошланмаган",
        };
        return statuses[status] || "";
      };

      const getPriorityUz = (priority) => {
        const priorities = {
          [TaskPriority.LOW]: "Паст",
          [TaskPriority.MEDIUM]: "Ўрта",
          [TaskPriority.HIGH]: "Юқори",
        };
        return priorities[priority] || "-";
      };

      const getPriorityStyle = (priority) => {
        const styles = {
          [TaskPriority.LOW]: { fontColor: "FF4CAF50" },
          [TaskPriority.MEDIUM]: { fontColor: "FFFFC107" },
          [TaskPriority.HIGH]: { fontColor: "FFF44336" },
        };
        return styles[priority] || { fontColor: "FF000000" };
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

      const formatDateOnly = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Сарлавҳа", key: "title", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Тавсиф", key: "description", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Ҳолат", key: "status", minWidth: 18 },
        { header: "Муҳимлик", key: "priority", minWidth: 12 },
        { header: "Текширилган", key: "checked", minWidth: 14 },
        { header: "Бошланиш/Тугаш", key: "dates", maxWidth: 14 },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратувчи", key: "createdBy", minWidth: 24 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({ header: col.header, key: col.key }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = tasks.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const data = {
          number: String(index + 1),
          title: t.title || "",
          description: t.description || "",
          status: getStatusUz(t.status),
          priority: getPriorityUz(t.priority),
          checked: t.checked ? "Ҳа" : "Йўқ",
          dates: formatDateOnly(t.startDate) + " " + formatDateOnly(t.endDate),
          object: t.object?.name || "-",
          createdBy: createdByName || "-",
          createdAt: formatDate(t.createdAt),
          _status: t.status,
          _priority: t.priority,
          _checked: t.checked,
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

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const priorityStyle = getPriorityStyle(data._priority);
        const { _status, _priority, _checked, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

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
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Sarlavha
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Tavsif

        // Holat - rangli fon
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        // Muhimlik - rangli matn
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: priorityStyle.fontColor } };

        // Tekshirilgan - rangli
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(6).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _checked ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // Boshlanish/Tugash
        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Yaratuvchi
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan sana
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

      // Status bo'yicha hisoblash
      const statusCounts = {
        [TaskStatus.PENDING]: 0,
        [TaskStatus.IN_PROGRESS]: 0,
        [TaskStatus.CHECKING]: 0,
        [TaskStatus.COMPLETED_PARTIALLY]: 0,
        [TaskStatus.COMPLETED]: 0,
        [TaskStatus.LATE]: 0,
      };
      tasks.forEach((t) => {
        statusCounts[t.status]++;
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами вазифалар: ${tasks.length}`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Status statistikasi
      const statsRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:D${summaryRowNumber + 1}`);
      statsRow.getCell(1).value =
        `Bajarilgan: ${statusCounts[TaskStatus.COMPLETED]} | Текширилмоқда: ${statusCounts[TaskStatus.CHECKING]} | Жараёнда: ${statusCounts[TaskStatus.IN_PROGRESS]} | Кечиккан: ${statusCounts[TaskStatus.LATE]}`;
      statsRow.getCell(1).font = { size: FONT_SIZE, name: FONT_NAME };
      statsRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          progress: true,
          isOfficeTask: true,
          durationDays: true,
          productName: true,
          quantity: true,
          technicalParameters: true,
          unit: true,
          pricePerUnit: true,
          totalPrice: true,
          object: {
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
          subtasks: {
            orderBy: { createdAt: "asc" },
            where: { isActive: true },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              parentId: true,
              progress: true,
              durationDays: true,
              priority: true,
              productName: true,
              quantity: true,
              quantityOfCompleted: true,
              technicalParameters: true,
              unit: true,
              pricePerUnit: true,
              totalPrice: true,
              contractDate: true,
              deliveryAddress: true,
              contractNumber: true,
              client: {
                where: { isActive: true },
                select: { id: true, organizationName: true },
              },
              organization: {
                where: { isActive: true },
                select: { id: true, organizationName: true },
              },
              attachments: {
                where: { isActive: true },
                select: {
                  id: true,
                  originalname: true,
                  filename: true,
                  mimeType: true,
                  filesize: true,
                  url: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                  createdAt: true,
                },
              },
              assigned: {
                where: { user: { isActive: true } },
                select: {
                  id: true,
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                },
              },
              comments: {
                where: { isActive: true },
                select: {
                  id: true,
                  message: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                  worker: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                  createdAt: true,
                },
              },
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  role: true,
                },
              },
              createdAt: true,
              updatedAt: true,
            },
          },
          assigned: {
            where: { user: { isActive: true } },
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                  attachment: {
                    where: { taskId: id, isActive: true },
                    select: {
                      id: true,
                      originalname: true,
                      filename: true,
                      mimeType: true,
                      filesize: true,
                      url: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              role: true,
            },
          },
          comments: {
            where: { isActive: true },
            select: {
              id: true,
              message: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              worker: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              createdAt: true,
            },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              originalname: true,
              filename: true,
              mimeType: true,
              filesize: true,
              url: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              createdAt: true,
            },
          },
          status: true,
          startDate: true,
          endDate: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!task) throw new AppError(404, "task_not_found");

      let timeProgress = 0;
      const startDateMs = task.startDate.getTime();
      const endDateMs = task.endDate.getTime();
      const now = new Date();
      const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
      const nowMs = Date.now() - timezoneOffset;
      if (startDateMs < nowMs) {
        if (endDateMs < nowMs) timeProgress = 100;
        else {
          const differentStartWithEnd = endDateMs - startDateMs;
          const differentStartWithNow = nowMs - startDateMs;
          timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
        }
      }

      function groupAttachments(attachments) {
        const grouped = {};
        for (const att of attachments) {
          const date = att.createdAt.toISOString().split("T")[0];
          const userId = att.createdBy?.id || 0;
          const key = `${date}_${userId}`;
          if (!grouped[key]) {
            grouped[key] = {
              date,
              user: att.createdBy,
              attachments: [],
            };
          }
          grouped[key].attachments.push({
            id: att.id,
            filename: att.filename,
            url: att.url,
            originalname: att.originalname,
          });
        }
        return Object.values(grouped);
      }

      const groupedTaskAttachments = groupAttachments(task.attachments);

      const subtasksWithGroupedAttachments = task.subtasks.map((subT) => {
        const grouped = groupAttachments(subT.attachments);
        let subProgress = 0;
        const sMs = subT.startDate.getTime();
        const eMs = subT.endDate.getTime();
        if (sMs < nowMs) {
          if (eMs < nowMs) {
            subProgress = 100;
          } else {
            const diffSE = eMs - sMs;
            const diffSN = nowMs - sMs;
            subProgress = Math.floor((diffSN * 100) / diffSE);
          }
        }
        let remainingQuantity = null;
        if (subT.quantity !== null && subT.quantityOfCompleted !== null) {
          remainingQuantity = subT.quantity - subT.quantityOfCompleted;
        }

        return {
          ...subT,
          timeProgress: subProgress,
          attachmentsGrouped: grouped,
          remainingQuantity,
        };
      });

      const result = {
        ...task,
        attachmentsGrouped: groupedTaskAttachments,
        subtasks: subtasksWithGroupedAttachments,
        timeProgress,
      };

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneTaskExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { isActive: true, id },
      });
      if (!task) throw new AppError(404, "task_not_found");

      const tasks = await prisma.task.findMany({
        orderBy: { createdAt: "asc" },
        where: {
          isActive: true,
          parentId: id,
        },
        include: {
          organization: {
            where: { isActive: true },
            select: { organizationName: true },
          },
          client: {
            where: { isActive: true },
            select: {
              organizationName: true,
              stirNumber: true,
            },
          },
        },
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Tasks");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.1; // Qator balandligi
      const MIN_ROW_HEIGHT = 25;
      const PARAM_MAX_WIDTH = 45;

      // ==================== YORDAMCHI FUNKSIYALAR ====================

      // Row height hisoblash (so'zlarni hisobga oladi)
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = text.split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          const words = paragraph.split(/\s+/);
          let currentLineLength = 0;

          words.forEach((word) => {
            if (currentLineLength + word.length + 1 > columnWidth) {
              totalLines += 1;
              currentLineLength = word.length;
            } else {
              currentLineLength += word.length + 1;
            }
          });
          totalLines += 1;
        });

        return Math.max(MIN_ROW_HEIGHT, Math.ceil(totalLines * LINE_HEIGHT));
      };

      // Status stillari
      const getStatusStyle = (status) => {
        const styles = {
          [TaskStatus.COMPLETED]: { bgColor: "FF90EE90", fontColor: "FF006400" },
          [TaskStatus.COMPLETED_PARTIALLY]: { bgColor: "FFFFD700", fontColor: "FF8B4513" },
          [TaskStatus.CHECKING]: { bgColor: "FFE6F3FF", fontColor: "FF1E90FF" },
          [TaskStatus.IN_PROGRESS]: { bgColor: "FFADD8E6", fontColor: "FF00008B" },
          [TaskStatus.LATE]: { bgColor: "FFFFCCCB", fontColor: "FF8B0000" },
          [TaskStatus.PENDING]: { bgColor: "FFF5F5F5", fontColor: "FF696969" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [TaskStatus.CHECKING]: "Текширилмоқда",
          [TaskStatus.COMPLETED]: "Бажарилган",
          [TaskStatus.COMPLETED_PARTIALLY]: "Қисман бажарилган",
          [TaskStatus.IN_PROGRESS]: "Жараёнда",
          [TaskStatus.LATE]: "Кечиккан",
          [TaskStatus.PENDING]: "Бошланмаган",
        };
        return statuses[status] || "";
      };

      const formatDate = (date) => {
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${date.getFullYear()}`;
      };

      const formatNumber = (num) => {
        return Number(num) /* .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", wrapText: false },
        { header: "Номи", key: "name", wrapText: true, maxWidth: PARAM_MAX_WIDTH },
        { header: "Параметри", key: "technicalParameters", wrapText: true, maxWidth: PARAM_MAX_WIDTH },
        { header: "Ўлчов бирлиги", key: "unit", wrapText: false },
        { header: "Миқдор", key: "quantity", wrapText: false },
        { header: "Бажарилган миқдори", key: "quantityOfCompleted", wrapText: false },
        { header: "Қолган миқдори", key: "remainingQuantity", wrapText: false },
        { header: "Бирлик нархи", key: "pricePerUnit", wrapText: false, style: { numFmt: "#,##0.00" } },
        { header: "Умумий нархи", key: "totalPrice", wrapText: false, style: { numFmt: "#,##0.00" } },
        // { header: "Ҳолат", key: "status", wrapText: false },
        { header: "Ташкилот", key: "org", maxWidth: 40 },
        { header: "Буюртмачи", key: "client", maxWidth: 40 },
        { header: "Етказиш манзили", key: "deliveryAddress", maxWidth: 40 },
        { header: "Бошланиш/Тугаш", key: "dates", maxWidth: 20 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        style: col.style,
      }));

      // Max uzunliklar (header bilan boshlaymiz)
      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = tasks.map((t, index) => {
        const data = {
          number: String(index + 1),
          name: t.productName || "",
          technicalParameters: t.technicalParameters || "",
          unit: getUnitUz(t.unit),
          quantity: String(Number(t.quantity)),
          quantityOfCompleted: String(Number(t.quantityOfCompleted)),
          remainingQuantity: String(Number(t.quantity) - Number(t.quantityOfCompleted)),
          pricePerUnit: formatNumber(fromMinorUnits(t.pricePerUnit)),
          totalPrice: formatNumber(fromMinorUnits(t.totalPrice)),
          // status: getStatusUz(t.status),
          org: `${t.organizationId ? t.organization.organizationName + "\n" : ""}${t.contractNumber ? "Шартнома № " + t.contractNumber + "\n" : ""}${t.contractDate ? "Сана " + formatDate(t.contractDate) : ""}`,
          client: t.client ? t.client.organizationName + "\n" + "ИНН: " + t.client.stirNumber : "",
          deliveryAddress: t.deliveryAddress || "",
          dates: formatDate(t.startDate) + " " + formatDate(t.endDate),
          _status: t.status,
        };

        // Max uzunliklarni yangilash
        columns.forEach((col, idx) => {
          if (col.maxWidth) return; // maxWidth belgilangan ustunlar o'tkazib yuboriladi

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
          width = col.maxWidth;
        } else {
          width = maxLengths[idx] + 3;
          width = Math.max(width, 8);
        }

        sheet.getColumn(idx + 1).width = width;
      });

      // Column widthlarni olish (row height hisoblash uchun)
      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const { _status, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height hisoblash (wrapText bo'lgan ustunlar uchun)
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: statusStyle.bgColor },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true };
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(8).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
        // row.getCell(10).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        row.getCell(11).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        row.getCell(12).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        row.getCell(13).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
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

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      let { object_id: objectId = null, assigned = [], startDate, endDate, productName, quantity, technicalParameters, unit, pricePerUnit, title, description, priority } = req.body;

      productName = typeof productName === "string" ? productName.trim() : "";
      quantity = !Number.isNaN(quantity) && Number(quantity) > 0 ? Number(quantity) : null;
      technicalParameters = typeof technicalParameters === "string" ? technicalParameters.trim() : "";
      unit = Object.values(Unit).includes(unit) ? unit : null;
      pricePerUnit = !Number.isNaN(Number(req.body.pricePerUnit)) && Number(req.body.pricePerUnit) > 0 ? BigInt(Math.round(Number(pricePerUnit) * 100)) : null;
      const totalPrice = pricePerUnit && quantity ? BigInt(Math.floor(quantity * Number(pricePerUnit))) : null;

      const task = await prisma.task.findFirst({
        where: { id, isActive: true, parentId: null },
        select: {
          id: true,
          status: true,
          assigned: { select: { id: true, userId: true } },
          subtasks: {
            where: { isActive: true },
            select: {
              id: true,
              assigned: { select: { id: true, userId: true } },
            },
          },
        },
      });
      if (!task) throw new AppError(404, "task_not_found");

      if (
        objectId &&
        !(await prisma.object.findFirst({
          where: { id: objectId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw new AppError(404, "object_not_found");
      }

      const assignedResult = (
        await prisma.user.findMany({
          where: {
            id: { in: assigned },
            isActive: true,
            role: { not: "SUPERADMIN" },
          },
          select: { id: true },
        })
      ).map((u) => u.id);
      const assignedsForDelete = task.assigned.filter((a) => !assignedResult.includes(a.userId)).map((a) => a.id);
      const assignedsForCreate = assignedResult.filter((id) => !task.assigned.some((a) => a.userId === id)).map((userId) => ({ taskId: id, userId }));
      const taskAssignmentsForDelete = [];
      for (const t of task.subtasks) {
        for (const a of t.assigned) {
          if (!assignedResult.includes(a.userId)) {
            taskAssignmentsForDelete.push(a.id);
          }
        }
      }

      let status = task.status;
      if (task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CHECKING && task.status !== TaskStatus.IN_PROGRESS) {
        status = endDate.getTime() <= Date.now() ? TaskStatus.LATE : TaskStatus.PENDING;
      }

      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id },
          data: {
            title,
            description,
            objectId,
            startDate,
            endDate,
            priority,
            status,
            productName,
            quantity,
            technicalParameters,
            unit,
            pricePerUnit,
            totalPrice,
          },
        });

        if (assignedsForCreate.length) {
          await tx.taskAssignment.createMany({
            data: assignedsForCreate,
          });
        }

        if (assignedsForDelete.length) {
          await tx.taskAssignment.deleteMany({
            where: {
              id: {
                in: assignedsForDelete,
              },
            },
          });
        }

        if (taskAssignmentsForDelete.length) {
          await tx.taskAssignment.deleteMany({
            where: {
              id: {
                in: taskAssignmentsForDelete,
              },
            },
          });
        }
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOneSubTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      let {
        startDate,
        endDate,
        productName,
        quantity,
        technicalParameters,
        unit,
        pricePerUnit,
        assigned = [],
        description,
        priority,
        organizationId,
        clientId,
        deliveryAddress,
        contractNumber,
        contractDate,
      } = req.body;

      const totalPrice = pricePerUnit ? BigInt(Math.floor(quantity * Number(pricePerUnit))) : null;

      if (endDate.getTime() < startDate.getTime()) {
        throw new AppError(400, "end_date_must_be_greater_than_or_equal_to_start_date");
      }

      const subTask = await prisma.task.findFirst({
        where: {
          id,
          isActive: true,
          parent: { isActive: true },
        },
        include: { assigned: true },
      });
      if (!subTask) throw new AppError(404, "task_not_found");

      const assignedResult = (
        await prisma.user.findMany({
          where: {
            id: { in: assigned },
            isActive: true,
            role: { not: "SUPERADMIN" },
            tasks: { some: { taskId: subTask.parentId } },
          },
          select: { id: true },
        })
      ).map((user) => user.id);

      const assignedsForDelete = subTask.assigned.filter((a) => !assignedResult.includes(a.userId)).map((a) => a.id);
      const assignedsForCreate = assignedResult.filter((userId) => !subTask.assigned.some((a) => a.userId === userId)).map((userId) => ({ taskId: id, userId }));

      let status = subTask.status;
      const quantityOfCompleted = Number(subTask.quantityOfCompleted) || 0;

      if (quantityOfCompleted > 0 && quantityOfCompleted < quantity) {
        status = TaskStatus.COMPLETED_PARTIALLY;
      } else if (quantityOfCompleted >= quantity) {
        status = TaskStatus.CHECKING;
      } else if (quantityOfCompleted === 0) {
        if (status !== TaskStatus.PENDING) status = TaskStatus.IN_PROGRESS;
      }

      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id, isActive: true },
          data: {
            description,
            startDate,
            endDate,
            priority,
            productName,
            quantity,
            technicalParameters,
            unit,
            status,
            pricePerUnit,
            totalPrice,
            organizationId,
            clientId,
            deliveryAddress,
            contractNumber,
            contractDate,
          },
        });

        if (assignedsForCreate.length) {
          await tx.taskAssignment.createMany({
            data: assignedsForCreate,
          });
        }

        if (assignedsForDelete.length) {
          await tx.taskAssignment.deleteMany({
            where: {
              id: {
                in: assignedsForDelete,
              },
            },
          });
        }
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { id, isActive: true },
      });
      if (!task) throw new AppError(404, "task_not_found");

      await prisma.task.update({
        where: { id },
        data: {
          isActive: false,
          deletedById: req.user.id,
          deletedAt: new Date(),
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOneSubTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const subTask = await prisma.task.findFirst({
        where: {
          id,
          isActive: true,
          parentId: { not: null },
          parent: { isActive: true },
        },
        include: { parent: true },
      });
      if (!subTask) throw new AppError(404, "task_not_found");

      await prisma.task.update({
        where: { id },
        data: {
          isActive: false,
          deletedById: req.user.id,
          deletedAt: new Date(),
        },
      });

      const subTasks = await prisma.task.findMany({
        where: {
          parentId: subTask.parentId,
          isActive: true,
        },
      });
      let status = subTask.parent.status;

      if (subTasks.length > 0) {
        if (subTask.parent.endDate.getTime() < Date.now()) {
          if (!subTasks.every((t) => t.status === "CHECKING" || t.status === "COMPLETED")) {
            status = "LATE";
          } else if (subTasks.every((t) => t.status === "COMPLETED")) {
            status = "COMPLETED";
          } else if (subTasks.every((t) => t.status === "CHECKING" || t.status === "COMPLETED")) {
            status = "CHECKING";
          }
        } else {
          if (subTasks.every((t) => t.status === "COMPLETED")) {
            status = "COMPLETED";
          } else if (subTasks.every((t) => t.status === "COMPLETED" || t.status === "CHECKING")) {
            status = "CHECKING";
          } else if (subTasks.some((t) => t.status === "IN_PROGRESS")) {
            status = "IN_PROGRESS";
          } else if (subTasks.every((t) => t.status === "PENDING")) {
            status = "PENDING";
          }
        }
      }

      let progress = subTask.parent.progress;
      const lengthTasks = subTasks.length;
      const countOfCompleted = subTasks.reduce((sum, t) => (t.status === "COMPLETED" ? sum + 1 : sum + 0), 0);

      if (lengthTasks === 0) {
        progress = 100;
      } else {
        if (countOfCompleted > 0) {
          progress = Math.floor((countOfCompleted * 100) / lengthTasks);
        } else {
          progress = 0;
        }
      }

      if (subTask.parent.status !== status) {
        await prisma.task.update({
          where: { id: subTask.parentId },
          data: { status, progress },
        });
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { status, page, limit } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;

      const findWhere = { isActive: false, parentId: null, ...(Object.values(TaskStatus).includes(status) && { status }) };

      const count = await prisma.task.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [tasks, grouped] = await Promise.all([
        prisma.task.findMany({
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            title: true,
            description: true,
            isOfficeTask: true,
            status: true,
            startDate: true,
            endDate: true,
            priority: true,
            progress: true,
            object: {
              where: { isActive: true },
              select: { id: true, name: true },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
              },
            },
            deletedBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
              },
            },
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        }),
        prisma.task.groupBy({ by: ["status"], _count: true, where: { isActive: false, parentId: null } }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, LATE: 0 };
      for (const g of grouped) {
        totals[g.status] = g._count;
        totals.ALL = totals.ALL + g._count;
      }

      res.status(200).json({
        status: "success",
        totals,
        count,
        page,
        totalPage,
        limit,
        data: tasks,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { id, isActive: false },
        select: { id: true },
      });
      if (!task) throw new AppError(404, "task_not_found");

      await prisma.task.update({
        where: { id },
        data: {
          isActive: true,
          deletedById: null,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { isActive: false, id },
        include: { attachments: true },
      });
      if (!task) throw new AppError(404, "task_not_found");

      await prisma.task.delete({
        where: { id },
      });
      if (task.attachments.length) {
        await storage.deleteMany(task.attachments.map((f) => f.filename));
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async changeStatusByWorker(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const subTask = await prisma.task.findFirst({
        where: { id, parentId: { not: null } },
        select: {
          id: true,
          status: true,
          assigned: true,
          parent: true,
        },
      });
      if (!subTask) throw new AppError(404, "task_not_found");
      if (!subTask.assigned.some((a) => a.userId === req.user.id) && req.user.role !== Role.SUPERADMIN) {
        throw new AppError(400, "that_can_only_assigned");
      }

      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id },
          data: { status: TaskStatus.COMPLETED },
        });

        const parentTask = await tx.task.findFirst({
          where: { isActive: true, id: subTask.parent.id },
          include: {
            subtasks: {
              where: { isActive: true },
            },
          },
        });

        const countSubTasksInParentTask = parentTask.subtasks.length;
        const countComplatedSubTasksInParentTask = parentTask.subtasks.reduce((sum, task) => (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CHECKING ? sum + 1 : sum + 0), 0);
        const resultPercent = Math.floor((countComplatedSubTasksInParentTask * 100) / countSubTasksInParentTask);

        let parentStatus = subTask.parent.status;

        if (resultPercent >= 100) {
          parentStatus = "COMPLETED";
        } else {
          if (new Date(parentTask.endDate).getTime() < Date.now()) {
            parentStatus = "LATE";
          } else {
            parentStatus = "COMPLETED_PARTIALLY";
          }
        }

        await tx.task.update({
          where: { id: subTask.parent.id },
          data: {
            progress: resultPercent,
            status: parentStatus,
          },
        });
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTasks(req, res, next) {
    try {
      const findWhere = {
        isActive: true,
        parentId: { not: null },
        parent: { isActive: true },
        assigned: { some: { userId: req.user.id } },
      };

      const [subTasks, grouped] = await Promise.all([
        prisma.task.findMany({
          where: findWhere,
          select: {
            id: true,
            title: true,
            description: true,
            durationDays: true,
            startDate: true,
            endDate: true,
            checked: true,
            status: true,
            priority: true,
            progress: true,
            productName: true,
            quantity: true,
            technicalParameters: true,
            unit: true,
            pricePerUnit: true,
            totalPrice: true,
            createdAt: true,
            updatedAt: true,
            isOfficeTask: true,
            contractDate: true,
            deliveryAddress: true,
            contractNumber: true,
            client: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            organization: {
              where: { isActive: true },
              select: { id: true, organizationName: true },
            },
            attachments: { where: { isActive: true } },
            assigned: {
              select: {
                id: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    email: true,
                    phone: true,
                    avatar: true,
                  },
                },
              },
            },
            comments: {
              where: { isActive: true },
              select: {
                id: true,
                message: true,
                createdBy: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    phone: true,
                    email: true,
                    avatar: true,
                    role: true,
                  },
                },
                createdAt: true,
              },
            },
          },
        }),
        prisma.task.groupBy({
          by: ["status"],
          _count: true,
          where: findWhere,
        }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CHECKING: 0, LATE: 0 };
      for (const g of grouped) {
        totals[g.status] = g._count;
        totals.ALL = totals.ALL + g._count;
      }

      res.status(200).json({
        status: "success",
        totals,
        data: subTasks,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createTaskComment(req, res, next) {
    try {
      const task = await prisma.task.findFirst({
        where: {
          id: req.body.task_id,
          isActive: true,
        },
        select: { assigned: true },
      });
      if (!task) throw new AppError(404, "task_not_found");

      const isExists = task.assigned.some((a) => a.userId === req.user.id);
      if (!isExists && req.user.role !== Role.SUPERADMIN) {
        throw new AppError(400, "write_comment_can_only_assigned_users");
      }

      await prisma.taskComment.create({
        data: {
          taskId: req.body.task_id,
          message: req.body.message,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createCommentFromSA(req, res, next) {
    try {
      const task = await prisma.task.findFirst({
        where: {
          id: req.body.task_id,
          isActive: true,
        },
      });
      if (!task) throw new AppError(404, "task_not_found");

      const worker = await prisma.user.findFirst({
        where: {
          id: req.body.worker_id,
          isActive: true,
        },
      });
      if (!worker) throw new AppError(404, "user_not_found");

      await prisma.taskComment.create({
        data: {
          workerId: req.body.worker_id,
          taskId: req.body.task_id,
          message: req.body.message,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneUserTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const subTask = await prisma.task.findFirst({
        where: {
          id,
          isActive: true,
          parentId: { not: null },
          parent: { isActive: true },
          assigned: {
            some: { userId: req.user.id },
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          durationDays: true,
          startDate: true,
          endDate: true,
          checked: true,
          status: true,
          priority: true,
          progress: true,
          isOfficeTask: true,
          createdAt: true,
          updatedAt: true,
          productName: true,
          quantity: true,
          quantityOfCompleted: true,
          technicalParameters: true,
          unit: true,
          pricePerUnit: true,
          totalPrice: true,
          contractDate: true,
          contractNumber: true,
          deliveryAddress: true,
          client: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          organization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              originalname: true,
              filename: true,
              mimeType: true,
              filesize: true,
              url: true,
            },
          },
          assigned: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  email: true,
                  phone: true,
                  avatar: true,
                  attachment: {
                    select: {
                      id: true,
                      originalname: true,
                      filename: true,
                      mimeType: true,
                      filesize: true,
                      url: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
          comments: {
            where: { isActive: true },
            select: {
              id: true,
              message: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              createdAt: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
            },
          },
          history: {
            where: { isActive: true },
            select: {
              id: true,
              quantityOfCompleted: true,
              description: true,
              attachments: {
                where: { isActive: true },
                select: {
                  id: true,
                  originalname: true,
                  url: true,
                  mimeType: true,
                  createdAt: true,
                },
              },
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  role: true,
                  avatar: true,
                },
              },
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!subTask) throw new AppError(404, "task_not_found");

      // const groupedAttachments = Object.values(
      //   subTask.attachments.reduce((acc, att) => {
      //     const creatorId = att.createdBy?.id || null;
      //     if (!acc[creatorId]) {
      //       acc[creatorId] = {
      //         createdBy: att.createdBy,
      //         attachments: [],
      //       };
      //     }
      //     acc[creatorId].attachments.push({
      //       id: att.id,
      //       originalname: att.originalname,
      //       filename: att.filename,
      //       mimeType: att.mimeType,
      //       filesize: att.filesize,
      //       url: att.url,
      //       createdAt: att.createdAt,
      //     });
      //     return acc;
      //   }, {}),
      // );

      // subTask.attachments = groupedAttachments;

      res.status(200).json({
        status: "success",
        data: subTask,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOneComment(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const comment = await prisma.taskComment.findFirst({
        where: { id, isActive: true },
        select: {
          id: true,
          createdById: true,
        },
      });
      if (!comment) throw new AppError(404, "comment_not_found");

      if (comment.createdById !== req.user.id && req.user.role !== Role.SUPERADMIN) {
        throw new AppError(400, "delete_can_only_owner");
      }

      await prisma.taskComment.update({
        where: { id },
        data: {
          isActive: false,
          deletedById: req.user.id,
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async checkTheTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { id, isActive: true },
      });
      if (!task) throw new AppError(404, "task_not_found");

      if (task.status === TaskStatus.COMPLETED) throw new AppError(400, "already_checked");

      await prisma.task.update({
        where: { id },
        data: { status: TaskStatus.COMPLETED },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async checkTheSubTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const subTask = await prisma.task.findFirst({
        where: {
          id,
          isActive: true,
          parent: { isActive: true },
          parentId: { not: null },
        },
        include: { parent: true },
      });
      if (!subTask) throw new AppError(404, "task_not_found");
      if (!subTask.parent) throw new AppError(404, "task_not_found");
      if (subTask.status !== "CHECKING") {
        throw new AppError(400, "cannot_change_to_completed_if_current_status_not_equal_to_cheching");
      }
      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id },
          data: { status: "COMPLETED" },
        });

        const parent = subTask.parent;
        let status = parent.status;
        const subTasks = await tx.task.findMany({
          where: {
            isActive: true,
            parentId: parent.id,
          },
        });

        if (parent.endDate.getTime() < Date.now() && status !== "CHECKING" && status !== "COMPLETED") {
          status = "LATE";
        } else {
          if (subTasks.every((t) => t.status === "COMPLETED")) {
            status = "COMPLETED";
          } else if (subTasks.every((t) => t.status === "COMPLETED" || t.status === "CHECKING")) {
            status = "CHECKING";
          } else if (subTasks.some((t) => t.status === "IN_PROGRESS" || t.status === "COMPLETED_PARTIALLY")) {
            status = "IN_PROGRESS";
          }
        }

        await tx.task.update({
          where: { id: parent.id },
          data: { status },
        });
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async search(req, res, next) {
    try {
      let { status, page, limit, key } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      status = Object.values(TaskStatus).includes(status) ? status : null;
      key = typeof key === "string" ? key.trim() : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        ...(key && {
          OR: [{ title: { contains: key, mode: "insensitive" } }, { description: { contains: key, mode: "insensitive" } }],
        }),
        ...(status && { status }),
      };

      const count = await prisma.task.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [tasks, totalsRes] = await Promise.all([
        prisma.task.findMany({
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            isOfficeTask: true,
            startDate: true,
            endDate: true,
            priority: true,
            progress: true,
            _count: {
              select: {
                subtasks: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
            subtasks: {
              where: { isActive: true },
              select: {
                id: true,
                comments: {
                  where: { isActive: true },
                  select: { id: true },
                },
              },
            },
            object: {
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
            assigned: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    phone: true,
                    email: true,
                    role: true,
                    avatar: true,
                  },
                },
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.task.groupBy({
          by: ["status"],
          _count: true,
          where: findWhere,
        }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, LATE: 0 };

      for (const g of totalsRes) {
        totals[g.status] = g._count;
        totals.ALL += g._count;
      }

      const result = tasks.map((task) => {
        let timeProgress = 0;
        const subtasksCount = task._count.subtasks;
        delete tasks._count;
        const startDateMs = task.startDate.getTime();
        const endDateMs = task.endDate.getTime();
        const nowMs = Date.now();
        if (startDateMs < nowMs) {
          if (endDateMs < nowMs) timeProgress = 100;
          else {
            const differentStartWithEnd = endDateMs - startDateMs;
            const differentStartWithNow = nowMs - startDateMs;
            timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
          }
        }
        const commentsCount = task.subtasks.reduce((sum, subTask) => sum + subTask.comments.length, 0);

        return {
          ...task,
          subtasksCount,
          timeProgress,
          commentsCount,
        };
      });

      res.status(200).json({
        status: "success",
        totals,
        totalCount: count,
        page,
        totalPage,
        limit,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserParentTasks(req, res, next) {
    try {
      let { status, page, limit } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      status = Object.values(TaskStatus).includes(status) ? status : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        assigned: { some: { userId: req.user.id } },
        ...(status && { status }),
      };

      const count = await prisma.task.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [tasks, totalsRes] = await Promise.all([
        prisma.task.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          where: findWhere,
          select: {
            id: true,
            title: true,
            description: true,
            pricePerUnit: true,
            totalPrice: true,
            status: true,
            startDate: true,
            endDate: true,
            priority: true,
            progress: true,
            productName: true,
            quantity: true,
            unit: true,
            technicalParameters: true,
            isOfficeTask: true,
            _count: {
              select: {
                subtasks: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
            subtasks: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                comments: {
                  where: {
                    isActive: true,
                  },
                  select: {
                    id: true,
                  },
                },
              },
            },
            object: {
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
            assigned: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    phone: true,
                    email: true,
                    role: true,
                    avatar: true,
                  },
                },
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.task.groupBy({
          by: ["status"],
          _count: true,
          where: {
            isActive: true,
            parentId: null,
            assigned: { some: { userId: req.user.id } },
          },
        }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, LATE: 0 };

      for (const g of totalsRes) {
        totals[g.status] = g._count;
        totals.ALL = totals.ALL + g._count;
      }

      const result = tasks.map((task) => {
        let timeProgress = 0;
        const subtasksCount = task._count.subtasks;
        delete tasks._count;
        const startDateMs = task.startDate.getTime();
        const endDateMs = task.endDate.getTime();
        const nowMs = Date.now();
        if (startDateMs < nowMs) {
          if (endDateMs < nowMs) {
            timeProgress = 100;
          } else {
            const differentStartWithEnd = endDateMs - startDateMs;
            const differentStartWithNow = nowMs - startDateMs;
            timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
          }
        }
        const commentsCount = task.subtasks.reduce((sum, subTask) => sum + subTask.comments.length, 0);

        return { ...task, subtasksCount, timeProgress, commentsCount };
      });

      res.status(200).json({
        status: "success",
        totals,
        totalCount: count,
        page,
        totalPage,
        limit,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserParentTasksExcelDoc(req, res, next) {
    try {
      let { status } = req.query;

      status = Object.values(TaskStatus).includes(status) ? status : null;

      const findWhere = {
        isActive: true,
        parentId: null,
        assigned: { some: { userId: req.user.id } },
        ...(status && { status }),
      };

      const tasks = await prisma.task.findMany({
        where: findWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          priority: true,
          checked: true,
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true },
          },
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Mening vazifalarim");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.5;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 45;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }
          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getStatusStyle = (status) => {
        const styles = {
          [TaskStatus.COMPLETED]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [TaskStatus.COMPLETED_PARTIALLY]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [TaskStatus.CHECKING]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [TaskStatus.IN_PROGRESS]: { bgColor: "FFE1F5FE", fontColor: "FF0288D1" },
          [TaskStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
          [TaskStatus.PENDING]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [TaskStatus.CHECKING]: "Текширилмоқда",
          [TaskStatus.COMPLETED]: "Бажарилган",
          [TaskStatus.COMPLETED_PARTIALLY]: "Қисман бажарилган",
          [TaskStatus.IN_PROGRESS]: "Жараёнда",
          [TaskStatus.LATE]: "Кечиккан",
          [TaskStatus.PENDING]: "Бошланмаган",
        };
        return statuses[status] || "";
      };

      const getPriorityUz = (priority) => {
        const priorities = {
          [TaskPriority.LOW]: "Паст",
          [TaskPriority.MEDIUM]: "Ўрта",
          [TaskPriority.HIGH]: "Юқори",
        };
        return priorities[priority] || "-";
      };

      const getPriorityStyle = (priority) => {
        const styles = {
          [TaskPriority.LOW]: { fontColor: "FF4CAF50" },
          [TaskPriority.MEDIUM]: { fontColor: "FFFFC107" },
          [TaskPriority.HIGH]: { fontColor: "FFF44336" },
        };
        return styles[priority] || { fontColor: "FF000000" };
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

      const formatDateOnly = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Сарлавҳа", key: "title", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Тавсиф", key: "description", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Ҳолат", key: "status", minWidth: 18 },
        { header: "Муҳимлик", key: "priority", minWidth: 12 },
        { header: "Текширилган", key: "checked", minWidth: 14 },
        {
          header: "Бошланиш/Тугаш",
          key: "dates",
          maxWidth: 20,
          style: { alignment: { horizontal: "center", vertical: "middle", wrapText: true } },
        },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратувчи", key: "createdBy", minWidth: 20 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        style: col.style,
        width: col.minWi ? col.minWidth : col.maxWidth,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = tasks.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const data = {
          number: String(index + 1),
          title: t.title || "",
          description: t.description || "",
          status: getStatusUz(t.status),
          priority: getPriorityUz(t.priority),
          checked: t.checked ? "Ҳа" : "Йўқ",
          dates: formatDateOnly(t.startDate) + " " + formatDateOnly(t.endDate),
          object: t.object?.name || "-",
          createdBy: createdByName || "-",
          createdAt: formatDate(t.createdAt),
          _status: t.status,
          _priority: t.priority,
          _checked: t.checked,
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

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const priorityStyle = getPriorityStyle(data._priority);
        const { _status, _priority, _checked, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Sarlavha
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Tavsif

        // Holat - rangli fon
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        // Muhimlik - rangli matn
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: priorityStyle.fontColor } };

        // Tekshirilgan - rangli
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(6).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _checked ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Yaratuvchi
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan sana
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

      // Status bo'yicha hisoblash
      const statusCounts = {
        [TaskStatus.PENDING]: 0,
        [TaskStatus.IN_PROGRESS]: 0,
        [TaskStatus.CHECKING]: 0,
        [TaskStatus.COMPLETED_PARTIALLY]: 0,
        [TaskStatus.COMPLETED]: 0,
        [TaskStatus.LATE]: 0,
      };
      tasks.forEach((t) => {
        statusCounts[t.status]++;
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами вазифалар: ${tasks.length}`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Status statistikasi
      const statsRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:F${summaryRowNumber + 1}`);
      statsRow.getCell(1).value =
        `Бажарилган: ${statusCounts[TaskStatus.COMPLETED]} | Текширилмоқда: ${statusCounts[TaskStatus.CHECKING]} | Жараёнда: ${statusCounts[TaskStatus.IN_PROGRESS]} | Бошланмаган: ${statusCounts[TaskStatus.PENDING]} | Кечиккан: ${statusCounts[TaskStatus.LATE]}`;
      statsRow.getCell(1).font = { size: FONT_SIZE, name: FONT_NAME };
      statsRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserOfficeTasks(req, res, next) {
    try {
      let { status, page, limit } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 1;
      status = Object.values(TaskStatus).includes(status) ? status : null;

      const findWhere = {
        isActive: true,
        isOfficeTask: true,
        parentId: null,
        assigned: { some: { userId: req.user.id } },
        ...(status && { status }),
      };

      const count = await prisma.task.count({
        where: findWhere,
      });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const [tasks, totalsRes] = await Promise.all([
        prisma.task.findMany({
          take: limit,
          skip: (page - 1) * limit,
          where: findWhere,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            description: true,
            pricePerUnit: true,
            totalPrice: true,
            status: true,
            startDate: true,
            endDate: true,
            priority: true,
            progress: true,
            productName: true,
            quantity: true,
            unit: true,
            technicalParameters: true,
            isOfficeTask: true,
            _count: {
              select: {
                subtasks: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
            subtasks: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                comments: {
                  where: {
                    isActive: true,
                  },
                  select: {
                    id: true,
                  },
                },
              },
            },
            object: {
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
            assigned: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    fname: true,
                    lname: true,
                    phone: true,
                    email: true,
                    role: true,
                    avatar: true,
                  },
                },
              },
            },
            createdBy: {
              where: { isActive: true },
              select: {
                id: true,
                fname: true,
                lname: true,
                phone: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.task.groupBy({
          by: ["status"],
          _count: true,
          where: {
            isActive: true,
            isOfficeTask: true,
            parentId: null,
            assigned: { some: { userId: req.user.id } },
          },
        }),
      ]);

      const totals = { ALL: 0, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, LATE: 0 };

      for (const g of totalsRes) {
        totals[g.status] = g._count;
        totals.ALL = totals.ALL + g._count;
      }

      const result = tasks.map((task) => {
        let timeProgress = 0;
        const subtasksCount = task._count.subtasks;
        delete tasks._count;
        const startDateMs = task.startDate.getTime();
        const endDateMs = task.endDate.getTime();
        const nowMs = Date.now();
        if (startDateMs < nowMs) {
          if (endDateMs < nowMs) timeProgress = 100;
          else {
            const differentStartWithEnd = endDateMs - startDateMs;
            const differentStartWithNow = nowMs - startDateMs;
            timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
          }
        }
        const commentsCount = task.subtasks.reduce((sum, subTask) => sum + subTask.comments.length, 0);

        return { ...task, subtasksCount, timeProgress, commentsCount };
      });

      res.status(200).json({
        status: "success",
        totals,
        totalCount: count,
        page,
        totalPage,
        limit,
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserOfficeTasksExcelDoc(req, res, next) {
    try {
      let { status } = req.query;

      status = Object.values(TaskStatus).includes(status) ? status : null;

      const findWhere = {
        isActive: true,
        isOfficeTask: true,
        parentId: null,
        assigned: { some: { userId: req.user.id } },
        ...(status && { status }),
      };

      const tasks = await prisma.task.findMany({
        where: findWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          priority: true,
          checked: true,
          object: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true },
          },
          createdAt: true,
        },
      });

      // ==================== EXCEL YARATISH ====================
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Mening vazifalarim");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.5;
      const MIN_ROW_HEIGHT = 25;
      const MAX_WIDTH = 45;

      // ==================== YORDAMCHI FUNKSIYALAR ====================
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = String(text).split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }
          const effectiveWidth = Math.floor(columnWidth * 1.2);
          const lines = Math.ceil(paragraph.length / effectiveWidth);
          totalLines += Math.max(1, lines);
        });

        const calculatedHeight = totalLines * LINE_HEIGHT;
        return Math.max(MIN_ROW_HEIGHT, calculatedHeight + 10);
      };

      const getStatusStyle = (status) => {
        const styles = {
          [TaskStatus.COMPLETED]: { bgColor: "FFE8F5E9", fontColor: "FF2E7D32" },
          [TaskStatus.COMPLETED_PARTIALLY]: { bgColor: "FFFFF8E1", fontColor: "FFF57C00" },
          [TaskStatus.CHECKING]: { bgColor: "FFE3F2FD", fontColor: "FF1976D2" },
          [TaskStatus.IN_PROGRESS]: { bgColor: "FFE1F5FE", fontColor: "FF0288D1" },
          [TaskStatus.LATE]: { bgColor: "FFFFEBEE", fontColor: "FFC62828" },
          [TaskStatus.PENDING]: { bgColor: "FFF5F5F5", fontColor: "FF757575" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [TaskStatus.CHECKING]: "Текширилмоқда",
          [TaskStatus.COMPLETED]: "Бажарилган",
          [TaskStatus.COMPLETED_PARTIALLY]: "Қисман бажарилган",
          [TaskStatus.IN_PROGRESS]: "Жараёнда",
          [TaskStatus.LATE]: "Кечиккан",
          [TaskStatus.PENDING]: "Бошланмаган",
        };
        return statuses[status] || "";
      };

      const getPriorityUz = (priority) => {
        const priorities = {
          [TaskPriority.LOW]: "Паст",
          [TaskPriority.MEDIUM]: "Ўрта",
          [TaskPriority.HIGH]: "Юқори",
        };
        return priorities[priority] || "-";
      };

      const getPriorityStyle = (priority) => {
        const styles = {
          [TaskPriority.LOW]: { fontColor: "FF4CAF50" },
          [TaskPriority.MEDIUM]: { fontColor: "FFFFC107" },
          [TaskPriority.HIGH]: { fontColor: "FFF44336" },
        };
        return styles[priority] || { fontColor: "FF000000" };
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

      const formatDateOnly = (date) => {
        if (!date) return "";
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${d.getFullYear()}`;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        { header: "№", key: "number", minWidth: 5 },
        { header: "Сарлавҳа", key: "title", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Тавсиф", key: "description", minWidth: 25, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Ҳолат", key: "status", minWidth: 18 },
        { header: "Муҳимлик", key: "priority", minWidth: 12 },
        { header: "Текширилган", key: "checked", minWidth: 14 },
        {
          header: "Бошланиш/Тугаш",
          key: "dates",
          maxWidth: 20,
          style: { alignment: { horizontal: "center", vertical: "middle", wrapText: true } },
        },
        { header: "Обект", key: "object", minWidth: 20, maxWidth: MAX_WIDTH, wrapText: true },
        { header: "Яратувчи", key: "createdBy", minWidth: 20 },
        { header: "Яратилган сана", key: "createdAt", minWidth: 18 },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        style: col.style,
        width: col.minWi ? col.minWidth : col.maxWidth,
      }));

      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = tasks.map((t, index) => {
        const createdByName = t.createdBy ? `${t.createdBy.fname || ""} ${t.createdBy.lname || ""}`.trim() : "";

        const data = {
          number: String(index + 1),
          title: t.title || "",
          description: t.description || "",
          status: getStatusUz(t.status),
          priority: getPriorityUz(t.priority),
          checked: t.checked ? "Ҳа" : "Йўқ",
          dates: formatDateOnly(t.startDate) + " " + formatDateOnly(t.endDate),
          object: t.object?.name || "-",
          createdBy: createdByName || "-",
          createdAt: formatDate(t.createdAt),
          _status: t.status,
          _priority: t.priority,
          _checked: t.checked,
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

      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const priorityStyle = getPriorityStyle(data._priority);
        const { _status, _priority, _checked, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
        });

        // Alohida alignmentlar
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" }; // №
        row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Sarlavha
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true }; // Tavsif

        // Holat - rangli fon
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.bgColor } };
        row.getCell(4).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };

        // Muhimlik - rangli matn
        row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(5).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: priorityStyle.fontColor } };

        // Tekshirilgan - rangli
        row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(6).font = {
          size: FONT_SIZE,
          name: FONT_NAME,
          bold: true,
          color: { argb: _checked ? "FF2E7D32" : "FFC62828" },
        };

        row.getCell(8).alignment = { horizontal: "left", vertical: "middle", wrapText: true }; // Obyekt
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" }; // Yaratuvchi
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle" }; // Yaratilgan sana
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

      // Status bo'yicha hisoblash
      const statusCounts = {
        [TaskStatus.PENDING]: 0,
        [TaskStatus.IN_PROGRESS]: 0,
        [TaskStatus.CHECKING]: 0,
        [TaskStatus.COMPLETED_PARTIALLY]: 0,
        [TaskStatus.COMPLETED]: 0,
        [TaskStatus.LATE]: 0,
      };
      tasks.forEach((t) => {
        statusCounts[t.status]++;
      });

      const summaryRow = sheet.getRow(summaryRowNumber);
      sheet.mergeCells(`A${summaryRowNumber}:C${summaryRowNumber}`);
      summaryRow.getCell(1).value = `Жами вазифалар: ${tasks.length}`;
      summaryRow.getCell(1).font = { bold: true, size: 12, name: FONT_NAME };
      summaryRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Status statistikasi
      const statsRow = sheet.getRow(summaryRowNumber + 1);
      sheet.mergeCells(`A${summaryRowNumber + 1}:F${summaryRowNumber + 1}`);
      statsRow.getCell(1).value =
        `Бажарилган: ${statusCounts[TaskStatus.COMPLETED]} | Текширилмоқда: ${statusCounts[TaskStatus.CHECKING]} | Жараёнда: ${statusCounts[TaskStatus.IN_PROGRESS]} | Бошланмаган: ${statusCounts[TaskStatus.PENDING]} | Кечиккан: ${statusCounts[TaskStatus.LATE]}`;
      statsRow.getCell(1).font = { size: FONT_SIZE, name: FONT_NAME };
      statsRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserParentTaskById(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { id, isActive: true, assigned: { some: { userId: req.user.id } } },
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          progress: true,
          durationDays: true,
          productName: true,
          quantity: true,
          quantityOfCompleted: true,
          technicalParameters: true,
          unit: true,
          pricePerUnit: true,
          totalPrice: true,
          isOfficeTask: true,
          object: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          subtasks: {
            orderBy: { createdAt: "asc" },
            where: { isActive: true },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              parentId: true,
              progress: true,
              durationDays: true,
              priority: true,
              productName: true,
              quantity: true,
              quantityOfCompleted: true,
              technicalParameters: true,
              unit: true,
              pricePerUnit: true,
              totalPrice: true,
              contractDate: true,
              deliveryAddress: true,
              contractNumber: true,
              client: {
                where: { isActive: true },
                select: { id: true, organizationName: true },
              },
              organization: {
                where: { isActive: true },
                select: { id: true, organizationName: true },
              },
              attachments: {
                where: { isActive: true },
                select: {
                  id: true,
                  originalname: true,
                  filename: true,
                  mimeType: true,
                  filesize: true,
                  url: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                  createdAt: true,
                },
              },
              assigned: {
                where: { user: { isActive: true } },
                select: {
                  id: true,
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                },
              },
              comments: {
                where: { isActive: true },
                select: {
                  id: true,
                  message: true,
                  createdBy: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                  worker: {
                    select: {
                      id: true,
                      fname: true,
                      lname: true,
                      phone: true,
                      email: true,
                      avatar: true,
                      role: true,
                    },
                  },
                  createdAt: true,
                },
              },
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  role: true,
                },
              },
              createdAt: true,
              updatedAt: true,
            },
          },
          assigned: {
            where: { user: { isActive: true } },
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                  attachment: {
                    where: { taskId: id, isActive: true },
                    select: {
                      id: true,
                      originalname: true,
                      filename: true,
                      mimeType: true,
                      filesize: true,
                      url: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              role: true,
            },
          },
          comments: {
            where: { isActive: true },
            select: {
              id: true,
              message: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              worker: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              createdAt: true,
            },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              originalname: true,
              filename: true,
              mimeType: true,
              filesize: true,
              url: true,
              createdBy: {
                select: {
                  id: true,
                  fname: true,
                  lname: true,
                  phone: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              createdAt: true,
            },
          },
          status: true,
          startDate: true,
          endDate: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!task) throw new AppError(404, "task_not_found");

      let timeProgress = 0;
      const startDateMs = task.startDate.getTime();
      const endDateMs = task.endDate.getTime();
      const now = new Date();
      const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
      const nowMs = Date.now() - timezoneOffset;
      if (startDateMs < nowMs) {
        if (endDateMs < nowMs) timeProgress = 100;
        else {
          const differentStartWithEnd = endDateMs - startDateMs;
          const differentStartWithNow = nowMs - startDateMs;
          timeProgress = Math.floor((differentStartWithNow * 100) / differentStartWithEnd);
        }
      }

      function groupAttachments(attachments) {
        const grouped = {};
        for (const att of attachments) {
          const date = att.createdAt.toISOString().split("T")[0];
          const userId = att.createdBy?.id || 0;
          const key = `${date}_${userId}`;
          if (!grouped[key]) {
            grouped[key] = {
              date,
              user: att.createdBy,
              attachments: [],
            };
          }
          grouped[key].attachments.push({
            id: att.id,
            filename: att.filename,
            url: att.url,
            originalname: att.originalname,
          });
        }
        return Object.values(grouped);
      }

      const groupedTaskAttachments = groupAttachments(task.attachments);

      const subtasksWithGroupedAttachments = task.subtasks.map((subT) => {
        const grouped = groupAttachments(subT.attachments);
        let subProgress = 0;
        const sMs = subT.startDate.getTime();
        const eMs = subT.endDate.getTime();
        if (sMs < nowMs) {
          if (eMs < nowMs) {
            subProgress = 100;
          } else {
            const diffSE = eMs - sMs;
            const diffSN = nowMs - sMs;
            subProgress = Math.floor((diffSN * 100) / diffSE);
          }
        }
        let remainingQuantity = null;
        if (subT.quantity !== null && subT.quantityOfCompleted !== null) {
          remainingQuantity = Number(subT.quantity) - Number(subT.quantityOfCompleted);
        }
        return {
          ...subT,
          quantity: subT.quantity !== null ? Number(subT.quantity) : null,
          quantityOfCompleted: subT.quantityOfCompleted !== null ? Number(subT.quantityOfCompleted) : null,
          timeProgress: subProgress,
          attachmentsGrouped: grouped,
          remainingQuantity,
        };
      });

      const result = {
        ...task,
        quantity: task.quantity !== null ? Number(task.quantity) : null,
        quantityOfCompleted: task.quantityOfCompleted !== null ? Number(task.quantityOfCompleted) : null,
        attachmentsGrouped: groupedTaskAttachments,
        subtasks: subtasksWithGroupedAttachments,
        timeProgress,
      };

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserOneTaskExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: {
          isActive: true,
          id,
          assigned: { some: { userId: req.user.id } },
        },
      });
      if (!task) throw new AppError(404, "task_not_found");

      const tasks = await prisma.task.findMany({
        orderBy: { createdAt: "asc" },
        where: {
          isActive: true,
          parentId: id,
        },
        include: {
          organization: {
            where: { isActive: true },
            select: { organizationName: true },
          },
          client: {
            where: { isActive: true },
            select: {
              organizationName: true,
              stirNumber: true,
            },
          },
        },
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Tasks");

      // ==================== KONSTANTALAR ====================
      const FONT_NAME = "Arial";
      const FONT_SIZE = 11;
      const LINE_HEIGHT = FONT_SIZE * 1.1; // Qator balandligi
      const MIN_ROW_HEIGHT = 25;
      const PARAM_MAX_WIDTH = 45;

      // ==================== YORDAMCHI FUNKSIYALAR ====================

      // Row height hisoblash (so'zlarni hisobga oladi)
      const calculateRowHeight = (text, columnWidth) => {
        if (!text) return MIN_ROW_HEIGHT;

        const paragraphs = text.split("\n");
        let totalLines = 0;

        paragraphs.forEach((paragraph) => {
          if (!paragraph.trim()) {
            totalLines += 1;
            return;
          }

          const words = paragraph.split(/\s+/);
          let currentLineLength = 0;

          words.forEach((word) => {
            if (currentLineLength + word.length + 1 > columnWidth) {
              totalLines += 1;
              currentLineLength = word.length;
            } else {
              currentLineLength += word.length + 1;
            }
          });
          totalLines += 1;
        });

        return Math.max(MIN_ROW_HEIGHT, Math.ceil(totalLines * LINE_HEIGHT));
      };

      // Status stillari
      const getStatusStyle = (status) => {
        const styles = {
          [TaskStatus.COMPLETED]: { bgColor: "FF90EE90", fontColor: "FF006400" },
          [TaskStatus.COMPLETED_PARTIALLY]: { bgColor: "FFFFD700", fontColor: "FF8B4513" },
          [TaskStatus.CHECKING]: { bgColor: "FFE6F3FF", fontColor: "FF1E90FF" },
          [TaskStatus.IN_PROGRESS]: { bgColor: "FFADD8E6", fontColor: "FF00008B" },
          [TaskStatus.LATE]: { bgColor: "FFFFCCCB", fontColor: "FF8B0000" },
          [TaskStatus.PENDING]: { bgColor: "FFF5F5F5", fontColor: "FF696969" },
        };
        return styles[status] || { bgColor: "FFFFFFFF", fontColor: "FF000000" };
      };

      const getStatusUz = (status) => {
        const statuses = {
          [TaskStatus.CHECKING]: "Tekshirilmoqda",
          [TaskStatus.COMPLETED]: "Bajarilgan",
          [TaskStatus.COMPLETED_PARTIALLY]: "Qisman bajarilgan",
          [TaskStatus.IN_PROGRESS]: "Jarayonda",
          [TaskStatus.LATE]: "Kechikkan",
          [TaskStatus.PENDING]: "Boshlanmagan",
        };
        return statuses[status] || "";
      };

      const formatDate = (date) => {
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        return `${day}.${month}.${date.getFullYear()}`;
      };

      const formatNumber = (num) => {
        return Number(num) /* .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) */;
      };

      // ==================== USTUNLAR ====================
      const columns = [
        {
          header: "№",
          key: "number",
          wrapText: false,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Номи",
          key: "name",
          wrapText: true,
          maxWidth: PARAM_MAX_WIDTH,
          style: { alignment: { horizontal: "left", vertical: "middle", wrapText: true } },
        },
        {
          header: "Параметри",
          key: "technicalParameters",
          wrapText: true,
          maxWidth: PARAM_MAX_WIDTH,
          style: { alignment: { horizontal: "left", vertical: "top", wrapText: true } },
        },
        {
          header: "Ўлчов бирлиги",
          key: "unit",
          wrapText: false,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Миқдор",
          key: "quantity",
          wrapText: false,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Бажарилган миқдори",
          key: "quantityOfCompleted",
          wrapText: false,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Қолган миқдори",
          key: "remainingQuantity",
          wrapText: false,
          style: { alignment: { horizontal: "center", vertical: "middle" } },
        },
        {
          header: "Бирлик нархи",
          key: "pricePerUnit",
          wrapText: false,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
        {
          header: "Умумий нархи",
          key: "totalPrice",
          wrapText: false,
          style: {
            numFmt: "#,##0.00",
            alignment: { horizontal: "right", vertical: "middle" },
          },
        },
        // {
        //   header: "Holat",
        //   key: "status",
        //   wrapText: false,
        //   style: { alignment: { horizontal: "center", vertical: "middle" } },
        // },
        {
          header: "Ташкилот",
          key: "org",
          style: { alignment: { horizontal: "center", vertical: "middle" } },
          maxWidth: PARAM_MAX_WIDTH,
        },
        {
          header: "Буюртмачи",
          key: "client",
          style: { alignment: { horizontal: "center", vertical: "middle" } },
          maxWidth: PARAM_MAX_WIDTH,
        },
        {
          header: "Етказиш манзили",
          key: "deliveryAddress",
          style: { alignment: { horizontal: "center", vertical: "middle" } },
          maxWidth: PARAM_MAX_WIDTH,
        },
        {
          header: "Бошланиш/Тугаш",
          key: "dates",
          maxWidth: 20,
        },
      ];

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.maxWidth || col.minWidth || 15,
        style: col.style,
      }));

      // Max uzunliklar (header bilan boshlaymiz)
      const maxLengths = columns.map((col) => col.header.length);

      // ==================== MA'LUMOTLARNI TAYYORLASH ====================
      const rowsData = tasks.map((t, index) => {
        const data = {
          number: String(index + 1),
          name: t.productName || "",
          technicalParameters: t.technicalParameters || "",
          unit: getUnitUz(t.unit),
          quantity: String(Number(t.quantity)),
          quantityOfCompleted: String(Number(t.quantityOfCompleted)),
          remainingQuantity: String(Number(t.quantity) - Number(t.quantityOfCompleted)),
          pricePerUnit: formatNumber(fromMinorUnits(t.pricePerUnit)),
          totalPrice: formatNumber(fromMinorUnits(t.totalPrice)),
          // status: getStatusUz(t.status),
          org: `${t.organizationId ? t.organization.organizationName + "\n" : ""}${t.contractNumber ? "Шартнома № " + t.contractNumber + "\n" : ""}${t.contractDate ? "Сана " + formatDate(t.contractDate) : ""}`,
          client: t.client?.organizationName ? t.client.organizationName + (t.client.stirNumber ? "ИНН: " + t.client.stirNumber : "") : "",
          deliveryAddress: t.deliveryAddress || "",
          dates: formatDate(t.startDate) + " " + formatDate(t.endDate),
          _status: t.status,
        };

        // Max uzunliklarni yangilash
        columns.forEach((col, idx) => {
          if (col.maxWidth) return; // maxWidth belgilangan ustunlar o'tkazib yuboriladi

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
          width = col.maxWidth;
        } else {
          width = maxLengths[idx] + 3;
          width = Math.max(width, 8);
        }

        sheet.getColumn(idx + 1).width = width;
      });

      // Column widthlarni olish (row height hisoblash uchun)
      const columnWidths = columns.map((_, idx) => sheet.getColumn(idx + 1).width);

      // ==================== MA'LUMOTLARNI QO'SHISH ====================
      rowsData.forEach((data) => {
        const statusStyle = getStatusStyle(data._status);
        const { _status, ...cleanData } = data;

        const row = sheet.addRow(cleanData);

        // Row height hisoblash (wrapText bo'lgan ustunlar uchun)
        let maxHeight = MIN_ROW_HEIGHT;
        columns.forEach((col, idx) => {
          if (col.wrapText) {
            const height = calculateRowHeight(cleanData[col.key], columnWidths[idx]);
            if (height > maxHeight) maxHeight = height;
          }
        });
        row.height = maxHeight;

        // Barcha celllarga stil
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: statusStyle.bgColor },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.font = { size: FONT_SIZE, name: FONT_NAME };
          cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
        });

        // Alohida fontlar
        // row.getCell(10).font = { size: FONT_SIZE, name: FONT_NAME, bold: true, color: { argb: statusStyle.fontColor } };
        row.getCell(10).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        row.getCell(13).alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
      });

      // ==================== HEADER STILI ====================
      const headerRow = sheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12, name: FONT_NAME };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { ...(cell.alignment || {}), horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "medium" },
          left: { style: "medium" },
          bottom: { style: "medium" },
          right: { style: "medium" },
        };
      });

      // Header qatorini muzlatish
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createTaskHistory(req, res, next) {
    try {
      const taskId = req.body.taskId;
      const quantityOfCompleted = req.body.quantityOfCompleted;
      const description = req.body.description;
      const createdById = req.user.id;

      const taskHistoryId = await createTaskHistoryOptimistic({
        taskId,
        quantityOfCompleted,
        description,
        createdById,
      });

      req.taskHistoryId = taskHistoryId;

      if (req.files) {
        req.taskHistoryId = taskHistoryId;
        return next();
      } else {
        return res.status(201).json({ status: "success" });
      }
    } catch (error) {
      if (req.files) await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },

  async uploadTaskHistoryAttachment(req, res, next) {
    try {
      const uploadedFiles = req.uploadedFiles;

      const newAttachmentsData = uploadedFiles.map((u) => {
        return {
          taskHistoryId: req.taskHistoryId,
          url: u.url,
          originalname: u.originalname,
          filename: u.filename,
          mimeType: u.mimeType,
          filesize: u.size,
          createdById: req.user.id,
        };
      });
      if (newAttachmentsData.length === 0) throw new AppError(400, "files_didnt_upload");

      await prisma.attachment.createMany({
        data: newAttachmentsData,
      });

      res.status(201).json({ status: "success" });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneSubTask(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const subTask = await prisma.task.findFirst({
        where: {
          id,
          isActive: true,
          parentId: { not: null },
          parent: { isActive: true },
        },
        include: {
          parent: true,
          object: true,
          organization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          client: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          attachments: {
            where: { isActive: true },
            select: {
              id: true,
              url: true,
              mimeType: true,
              originalname: true,
            },
          },
          assigned: {
            where: { user: { isActive: true } },
            include: {
              user: {
                include: {
                  avatar: true,
                },
              },
            },
          },
          comments: {
            where: { isActive: true },
            include: {
              createdBy: {
                include: {
                  avatar: true,
                },
              },
              worker: {
                include: {
                  avatar: true,
                },
              },
            },
          },
          createdBy: {
            include: {
              avatar: true,
            },
          },
          history: {
            where: {
              isActive: true,
            },
            include: {
              createdBy: {
                include: {
                  avatar: true,
                },
              },
              task: true,
              attachments: {
                where: {
                  isActive: true,
                },
              },
            },
          },
        },
      });
      if (!subTask) throw new AppError(404, "task_not_found");

      const result = {
        id: subTask.id,
        title: subTask.title,
        description: subTask.description,
        startDate: subTask.startDate,
        endDate: subTask.endDate,
        progress: subTask.progress,
        isOfficeTask: subTask.isOfficeTask,
        productName: subTask.productName,
        quantity: subTask.quantity,
        quantityOfCompleted: subTask.quantityOfCompleted,
        technicalParameters: subTask.technicalParameters,
        pricePerUnit: subTask.pricePerUnit,
        totalPrice: subTask.totalPrice,
        checked: subTask.checked,
        unit: subTask.unit,
        priority: subTask.priority,
        status: subTask.status,
        organization: subTask.organization,
        client: subTask.client,
        attachments: subTask.attachments,
        createdAt: subTask.createdAt,
        updatedAt: subTask.updatedAt,
        assigned: subTask.assigned.map((a) => ({
          id: a.id,
          userId: a.userId,
          user: {
            id: a.user.id,
            fname: a.user.fname,
            lname: a.user.lname,
            role: a.user.role,
            avatar: a.user.avatar
              ? {
                  url: a.user.avatar.url,
                }
              : null,
          },
        })),
        comments: subTask.comments.map((c) => ({
          id: c.id,
          message: c.message,
          worker: {
            id: c.worker.id,
            fname: c.worker.fname,
            lname: c.worker.lname,
            role: c.worker.role,
            avatar: c.worker.avatar
              ? {
                  url: c.worker.avatar.url,
                }
              : null,
          },
          workerId: c.workerId,
          createdBy: {
            id: c.createdBy.id,
            fname: c.createdBy.fname,
            lname: c.createdBy.lname,
            role: c.createdBy.role,
            avatar: c.createdBy.avatar
              ? {
                  url: c.createdBy.avatar.url,
                }
              : null,
          },
          createdAt: c.createdAt,
        })),
        createdBy: {
          id: subTask.createdBy.id,
          fname: subTask.createdBy.fname,
          lname: subTask.createdBy.lname,
          role: subTask.createdBy.role,
          avatar: subTask.createdBy.avatar
            ? {
                url: subTask.createdBy.avatar.url,
              }
            : null,
        },
        history: subTask.history.map((h) => ({
          id: h.id,
          quantityOfCompleted: h.quantityOfCompleted,
          description: h.description,
          attachments: h.attachments.map((a) => ({
            id: a.id,
            originalname: a.originalname,
            mimeType: a.mimeType,
            filesize: a.filesize,
            url: a.url,
            createdAt: a.createdAt,
          })),
          createdBy: {
            id: h.createdBy.id,
            fname: h.createdBy.fname,
            lname: h.createdBy.lname,
            role: h.createdBy.role,
            avatar: h.createdBy.avatar
              ? {
                  url: h.createdBy.avatar.url,
                }
              : null,
          },
          createdAt: h.createdAt,
          updatedAt: h.updatedAt,
        })),
      };

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOneTaskHistory(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await deleteOneTaskHistoryOptimistic({
        id,
        createdById: req.user.id,
        role: req.user.role,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      netx(localErrorHandler(error));
    }
  },

  async changeSubTaskToInProgress(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const subtask = await prisma.task.findFirst({
        where: { isActive: true, id, parentId: { not: null } },
        include: {
          assigned: true,
          parent: true,
        },
      });
      if (!subtask) throw new AppError(404, "task_not_found");

      if (!subtask.assigned.some((a) => a.userId === req.user.id) && req.user.role !== Role.SUPERADMIN) {
        throw new AppError(400, "no_access");
      }

      if (subtask.status !== TaskStatus.PENDING) {
        throw new AppError(400, "task_is_already_started");
      }

      await prisma.task.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
      });

      if (subtask.parent.status === "PENDING") {
        await prisma.task.update({
          where: { id: subtask.parentId },
          data: { status: "IN_PROGRESS" },
        });
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOneTaskHistory(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await prisma.$transaction(async (tx) => {
        const taskHistory = await tx.taskHistory.findFirst({
          where: { isActive: true, id },
        });

        if (!taskHistory) throw new AppError(404, "task_history_not_found");

        if (taskHistory.createdById !== req.user.id && req.user.role !== Role.SUPERADMIN) {
          throw new AppError(400, "no_access");
        }

        const quantityOfCompleted = Number(req.body.quantityOfCompleted);
        const description = req.body.description;

        const subTask = await tx.task.findFirst({
          where: { isActive: true, id: taskHistory.taskId },
        });
        if (!subTask) throw new AppError(404, "task_not_found");

        const diff = Number(taskHistory.quantityOfCompleted) - quantityOfCompleted;

        await tx.taskHistory.update({
          where: { id },
          data: {
            quantityOfCompleted,
            description,
          },
        });

        const newQuantityOfCompleted = Math.max(0, Number(subTask.quantityOfCompleted) - diff);
        let status = subTask.status;

        if (newQuantityOfCompleted >= Number(subTask.quantity)) {
          status = "CHECKING";
        } else if (newQuantityOfCompleted < Number(subTask.quantity) && newQuantityOfCompleted !== 0) {
          status = "COMPLETED_PARTIALLY";
        } else if (newQuantityOfCompleted === 0) {
          status = "IN_PROGRESS";
        }

        await tx.task.update({
          where: { id: subTask.id },
          data: {
            quantityOfCompleted: newQuantityOfCompleted,
            status,
          },
        });

        const parentTask = await tx.task.findFirst({
          where: {
            isActive: true,
            id: subTask.parentId,
          },
        });

        if (parentTask) {
          const nowMs = Date.now();
          const parentVersion = parentTask.version;
          let parentStatus = parentTask.status;

          const subtasks = await tx.task.findMany({ where: { parentId: parentTask.id, isActive: true } });

          const allCompleted = subtasks.every((t) => t.status === "COMPLETED");
          const anyChecking = subtasks.every((t) => t.status === "COMPLETED" || t.status === "CHECKING");
          const someInProgress = subtasks.some((t) => t.status === "IN_PROGRESS" || t.status === "COMPLETED_PARTIALLY");
          const isLate = new Date(parentTask.endDate).getTime() < nowMs;

          if (allCompleted) parentStatus = "COMPLETED";
          else if (anyChecking) parentStatus = "CHECKING";
          else if (isLate) parentStatus = "LATE";
          else if (someInProgress) parentStatus = "IN_PROGRESS";

          const updateParentRes = await tx.task.updateMany({
            where: { version: parentVersion, id: parentTask.id },
            data: {
              status: parentStatus,
              version: { increment: 1 },
            },
          });
          if (updateParentRes.count === 0) throw new AppError(400, "fund_conflict_retry_failed");
        }
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateTaskStatus(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const task = await prisma.task.findFirst({
        where: { isActive: true, id },
      });
      if (!task) throw new AppError(404, "task_not_found");

      await prisma.task.update({
        where: { id },
        data: { status: req.body.status },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = taskController;
