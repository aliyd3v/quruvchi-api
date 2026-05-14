const prisma = require("../lib/prisma");

class taskService {
  async create() {}

  async getList() {}

  async getOfficeList() {}

  async getUserTaskList() {}

  async getById() {}

  async getUserTaskById() {}

  async update() {}

  async softDelete() {}

  async getTrashList() {}

  async restore() {}

  async delete() {}

  async createSubTask() {}

  async getSubTaskById() {}

  async updateSubTask() {}

  async softDeleteSubTask() {}

  async deleteSubTask() {}

  async createHistory() {}

  async updateHistory() {}

  async softDeleteHistory() {}

  async deleteHistory() {}

  async createTaskComment() {}

  async createSATaskComment() {}

  async deleteComment() {}

  async check() {}

  async checkSubTask() {}

  async search() {}
}

module.exports = new taskService();
