const { exec } = require("child_process");
const path = require("path");
const Config = require("../config");
const { promisify } = require("util");
const fs = require("fs");

const execPromise = promisify(exec);

async function backupDatabase() {
  const filename = `backup_${Date.now()}.dump`;
  const filePath = path.join(__dirname, "uploads", filename);
  const command = `pg_dump "${Config.DATABASE_URL}" -Fc -f ${filePath}`;
  const { _, stderr } = await execPromise(command);
  if (stderr) console.log("⚠️ Backup stderr:", stderr);
  if (!fs.existsSync(filePath)) throw new Error("Backup file was not created");
  const stats = fs.statSync(filePath);
  return { filePath, filename };
}

module.exports = { backupDatabase };
