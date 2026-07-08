import 'dotenv/config';
import path from 'path';
import { prisma } from '../prisma';
import { sendTelegramPhoto } from '../routes/telegram';

async function main() {
  const [, , chatId, filePathArg] = process.argv;
  if (!chatId || !filePathArg) {
    throw new Error('Usage: npm run telegram:test-photo -- <chatId> <fullPath>');
  }

  const filePath = path.resolve(filePathArg);
  await sendTelegramPhoto(chatId, filePath, `ReplayFX test photo\n${path.basename(filePath)}`);
  console.log(`Telegram test photo sent to ${chatId}: ${filePath}`);
}

main()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
