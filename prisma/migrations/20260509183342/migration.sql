/*
  Warnings:

  - You are about to drop the column `searchVector` on the `Document` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Document_search_vector_idx";

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CommentThread" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "searchVector",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DocumentVersion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PasswordResetToken" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "token" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ShareToken" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "token" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;
