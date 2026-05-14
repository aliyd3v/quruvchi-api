const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");
const { hashPassword } = require("../utils/bcrypt");
const { Role } = require("../generated/prisma");
const { DATABASE_URL: connectionString, SUPERADMIN_DEFAULT_PASSWORD, SUPERADMIN_PHONE: phone, SUPERADMIN_EMAIL: email } = require("../config");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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
        const passwordHash = await hashPassword(SUPERADMIN_DEFAULT_PASSWORD);
        await prisma.user.create({
          data: {
            role: Role.SUPERADMIN,
            fname: "Boss",
            lname: "Quruvchi",
            phone,
            email,
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
