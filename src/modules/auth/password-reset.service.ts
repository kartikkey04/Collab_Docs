/**
 * password-reset.service.ts
 *
 * Email-based password reset.
 *
 * FLOW:
 *   1. POST /auth/forgot-password  { email }
 *      → generate a UUID token, store it with 1-hour TTL, send email
 *   2. POST /auth/reset-password   { token, password }
 *      → validate token (exists, not expired, not used)
 *      → hash new password, update User.passwordHash, mark token used
 *
 * EMAIL:
 *   Uses nodemailer. In development, logs the reset link to console if
 *   SMTP is not configured (so you can still test the flow locally).
 *
 * SECURITY:
 *   - Token is a UUID (128 bits) — not guessable
 *   - Token expires in 1 hour
 *   - Token is single-use (usedAt set on consumption)
 *   - We never confirm whether an email is registered (prevents user enumeration)
 */

import { scryptSync, randomBytes } from "crypto";
import { prisma } from "../../services/db/prisma.js";
import { config } from "../../config/env.js";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function sendResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${config.appBaseUrl}/auth/reset-password?token=${token}`;

  // If nodemailer is configured, use it. Otherwise log to console (dev mode).
  if (config.smtpHost) {
    // Dynamic import so the dep is optional
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host:   config.smtpHost,
      port:   config.smtpPort,
      secure: false,  // 587 uses STARTTLS, not SSL
      auth:   { user: config.smtpUser, pass: config.smtpPass },
      tls:    { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from:    `"CollabDocs" <${config.smtpFrom}>`,
      to:      email,
      subject: "Reset your CollabDocs password",
      text:    `Click the link below to reset your password (expires in 1 hour):\n\n${resetUrl}`,
      html:    `<p>Click <a href="${resetUrl}">here</a> to reset your password (expires in 1 hour).</p>`,
    });
  } else {
    // Dev fallback — print to console
    console.log(`\n[DEV] Password reset link for ${email}:\n${resetUrl}\n`);
  }
}

export class PasswordResetService {
  /**
   * Request a password reset.
   * Always returns success even if the email doesn't exist — prevents enumeration.
   */
  async requestReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // Silent — don't reveal if email exists

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data:  { usedAt: new Date() },
    });

    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId:    user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    await sendResetEmail(email, resetToken.token);
  }

  /**
   * Apply a password reset.
   * Returns true on success, false if the token is invalid/expired/used.
   */
  async applyReset(token: string, newPassword: string): Promise<boolean> {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) return false;
    if (resetToken.usedAt) return false;
    if (resetToken.expiresAt < new Date()) return false;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data:  { passwordHash: hashPassword(newPassword) },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data:  { usedAt: new Date() },
      }),
    ]);

    return true;
  }
}

export const passwordResetService = new PasswordResetService();
