const prisma = require("../lib/prisma");
const transferService = require("../services/transfer.service");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const allowedColumnKeys = ["createdAt", "updatedAt"];

const fundTransferController = {
  async createUserToUser(req, res, next) {
    try {
      const {
        body: { recipientUserId, amount, note },
        user: { id: createdById },
      } = req;

      if (recipientUserId === createdById) throw new AppError(400, "you_cant_transfer_from_self_to_self");

      await transferService.createUserToUser({
        recipientUserId,
        createdById,
        amount,
        note: note || null,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createUserToObject(req, res, next) {
    try {
      const {
        body: { toObjectId, amount, note },
        user: { id: createdById },
      } = req;

      await transferService.createUserToObject({
        objectId: toObjectId,
        createdById,
        amount,
        note: note || null,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createObjectToUser(req, res, next) {
    try {
      const {
        body: { fromObjectId, amount, note, recipientUserId },
        user: { id: createdById },
      } = req;

      await transferService.createObjectToUser({
        fromObjectId,
        recipientUserId,
        amount,
        note: note || null,
        createdById,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createObjectToOrganization(req, res, next) {
    try {
      const {
        body: { fromObjectId, amount, note, toOrganizationId },
        user: { id: createdById },
      } = req;

      await transferService.createObjectToOrg({
        fromObjectId,
        toOrganizationId,
        amount,
        note: note || null,
        createdById,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createUserToOrganization(req, res, next) {
    try {
      const {
        body: { amount, note, toOrganizationId, contractNumber },
        user: { id: createdById },
      } = req;

      await transferService.createUserToOrg({
        toOrganizationId,
        amount,
        note: note || null,
        createdById,
        contractNumber,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async giveFromObject(req, res, next) {
    try {
      const {
        body: { fromObjectId, amount, note },
        user: { id: createdById },
      } = req;

      await transferService.createObjectToSelfUser({
        fromObjectId,
        amount,
        note: note || null,
        createdById,
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOneTransfer(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const { id: userId, role } = req.user;
      await transferService.delete({ transferId: id, userId, role });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOneTransfer(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      const {
        body: { amount, note },
        user: { id: userId, role },
      } = req;

      await transferService.update({
        transferId: id,
        amount,
        note: note || null,
        role,
        userId,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");

      await transferService.restore(id);

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

      await transferService.absoluteDelete(id);

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserTransfers(req, res, next) {
    try {
      let { limit, page, sort, reverse } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      sort = allowedColumnKeys.includes(sort) ? sort : "createdAt";

      const findWhere = { isActive: true, OR: [{ createdById: req.user.id }, { recipientUserId: req.user.id }] };

      const count = await prisma.fundTransfer.count({ where: findWhere });
      const totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const transfers = await prisma.fundTransfer.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: findWhere,
        select: {
          id: true,
          amount: true,
          note: true,
          fromObject: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          toObject: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          fromOrganization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          toOrganization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          recipientUser: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          senderUser: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          createdAt: true,
        },
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: transfers,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(req, res, next) {
    try {
      let { limit, page, sort, reverse } = req.query;

      page = !Number.isNaN(Number(page)) && Number(page) > 0 && Number.isInteger(Number(page)) ? Number(page) : 1;
      limit = !Number.isNaN(Number(limit)) && Number(limit) > 0 && Number.isInteger(Number(limit)) ? Number(limit) : 30;
      reverse = reverse !== "false";
      sort = allowedColumnKeys.includes(sort) ? sort : "updatedAt";

      const count = await prisma.fundTransfer.count({ where: { isActive: false } });
      let totalPage = Math.ceil(count / limit);
      page = !totalPage ? 1 : page > totalPage ? totalPage : page;

      const transfers = await prisma.fundTransfer.findMany({
        orderBy: { [sort]: reverse ? "desc" : "asc" },
        skip: (page - 1) * limit,
        take: limit,
        where: { isActive: false },
        select: {
          id: true,
          amount: true,
          note: true,
          fromObject: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          toObject: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          fromOrganization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          toOrganization: {
            where: { isActive: true },
            select: { id: true, organizationName: true },
          },
          recipientUser: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          senderUser: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          createdBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          deletedBy: {
            where: { isActive: true },
            select: { id: true, fname: true, lname: true, avatar: true, role: true },
          },
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: transfers,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = fundTransferController;
