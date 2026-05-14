const { PrismaClient } = require("@prisma/client");
const { withAccelerate } = require("@prisma/extension-accelerate");
const { hashPassword } = require("../utils/bcrypt");
const Config = require("../config");

const prisma = new PrismaClient().$extends(withAccelerate());

const main = async () => {
  try {
    await prisma.$connect();
    console.log("Database is connected");
    const superadmin = await prisma.user.findFirst({
      where: { role: "SUPERADMIN", isActive: true },
    });
    if (!superadmin) {
      console.log("SUPERADMIN is not found");
      console.log("SUPERADMIN create process...");
      try {
        const passwordHash = await hashPassword(Config.SUPERADMIN_DEFAULT_PASSWORD);
        await prisma.user.create({
          data: {
            role: "SUPERADMIN",
            fname: "XURSAND",
            lname: "JUMYOZOV",
            phone: Config.SUPERADMIN_PHONE,
            email: Config.SUPERADMIN_EMAIL,
            password: passwordHash,
          },
        });
      } catch (error) {
        console.log("Something went wrong on process create SUPERADMIN");
        console.log(error);
      }
      console.log("SUPERADMIN created successfully");
    }
  } catch (error) {
    console.log("Database connection error: " + error);
    process.exitCode = 1;
  }
};
main();

module.exports = prisma;
