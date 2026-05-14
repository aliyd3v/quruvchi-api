const callService = require("./call.service");
const prisma = require("./prisma");

class contactService {
  async create({ data } = {}) {
    try {
      await prisma.inbox.create({
        data,
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

module.exports = new contactService();
