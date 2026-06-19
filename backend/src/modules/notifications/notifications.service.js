'use strict';

import { config } from '../../config/index.js';

function defaultFooter(shopName, shopContactEmail) {
  if (shopName && shopContactEmail) {
    return `\n\n${shopName} • Contact: ${shopContactEmail}`;
  }

  return '\n\nThank you for using TAILORSTAQ.';
}

function buildHtmlSection(title, body) {
  return `<p><strong>${title}</strong></p><p>${body.replace(/\n/g, '<br/>')}</p>`;
}

export function buildVerificationEmail({ email, fullName, token }) {
  const link = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = 'Verify your TAILORSTAQ email address';
  const text = `Hello ${fullName || 'Customer'},\n\n` +
    `Please verify your email address by clicking the link below within 24 hours.\n${link}\n\n` +
    'If you did not create an account, please ignore this email.';

  const html = `${buildHtmlSection('Verify your email address', `Please verify your email by clicking the link below within 24 hours.<br/><a href="${link}">${link}</a>`)}<p>If you did not create an account, please ignore this email.</p>`;

  return { to: email, subject, text, html };
}

export function buildAccountLockedEmail({ email, fullName, lockoutMinutes }) {
  const subject = 'Your TAILORSTAQ account has been temporarily locked';
  const text = `Hello ${fullName || 'Customer'},\n\n` +
    `Your account has been locked for ${lockoutMinutes} minutes due to too many failed login attempts. Please wait and try again later, or reset your password if you need immediate access.`;

  const html = buildHtmlSection('Account locked', `Your account has been locked for ${lockoutMinutes} minutes due to too many failed login attempts.`);

  return { to: email, subject, text, html };
}

export function buildTenantConfirmationEmail({ email, businessName }) {
  const subject = 'TAILORSTAQ registration received';
  const text = `Hello ${businessName},\n\n` +
    'We have received your registration request and will review it shortly. You will be notified once your application has been approved or rejected.';

  const html = buildHtmlSection('Registration received', 'We have received your registration request and will review it shortly. You will be notified once your application has been approved or rejected.');

  return { to: email, subject, text, html };
}

export function buildTenantApprovalEmail({ email, businessName }) {
  const subject = 'Your TAILORSTAQ tenant request has been approved';
  const text = `Hello ${businessName},\n\nCongratulations! Your tenant request has been approved. Your shop is now active on TAILORSTAQ.`;

  const html = buildHtmlSection('Tenant approved', 'Congratulations! Your tenant request has been approved. Your shop is now active on TAILORSTAQ.');

  return { to: email, subject, text, html };
}

export function buildTenantRejectionEmail({ email, businessName, rejectionReason }) {
  const subject = 'Your TAILORSTAQ tenant request has been rejected';
  const text = `Hello ${businessName},\n\nWe are sorry to inform you that your tenant request has been rejected. Reason: ${rejectionReason}`;

  const html = buildHtmlSection('Tenant request rejected', `We are sorry to inform you that your tenant request has been rejected.<br/>Reason: ${rejectionReason}`);

  return { to: email, subject, text, html };
}

export function buildOrderConfirmationEmail({ customerEmail, customerName, reference, shopName, shopContactEmail }) {
  const subject = `Order confirmed — ${reference}`;
  const text = `Hello ${customerName || 'Customer'},\n\nYour order ${reference} has been received and is being processed.${defaultFooter(shopName, shopContactEmail)}`;

  const html = `${buildHtmlSection('Order confirmed', `Your order <strong>${reference}</strong> has been received and is being processed.`)}<p>${shopName} • Contact: ${shopContactEmail || 'Not provided'}</p>`;

  return { to: customerEmail, subject, text, html };
}

export function buildOrderStatusEmail({ customerEmail, customerName, reference, newStatus, shopName, shopContactEmail }) {
  const subject = `Order status updated — ${reference}`;
  const text = `Hello ${customerName || 'Customer'},\n\nThe status of your order ${reference} has been updated to ${newStatus}.${defaultFooter(shopName, shopContactEmail)}`;

  const html = `${buildHtmlSection('Order status updated', `The status of your order <strong>${reference}</strong> has been updated to <strong>${newStatus}</strong>.`)}<p>${shopName} • Contact: ${shopContactEmail || 'Not provided'}</p>`;

  return { to: customerEmail, subject, text, html };
}

export function buildReceiptEmail({ customerEmail, customerName, reference, shopName, shopContactEmail }) {
  const subject = `Your receipt for order ${reference}`;
  const text = `Hello ${customerName || 'Customer'},\n\nYour receipt for order ${reference} is attached.${defaultFooter(shopName, shopContactEmail)}`;

  const html = `${buildHtmlSection('Receipt attached', `Your receipt for order <strong>${reference}</strong> is attached.`)}<p>${shopName} • Contact: ${shopContactEmail || 'Not provided'}</p>`;

  return { to: customerEmail, subject, text, html };
}

export function buildSubscriptionConfirmationEmail({ email, fullName, tier, billingPeriod, amount, currency, activatedAt, expiresAt }) {
  const subject = 'Your TAILORSTAQ subscription is active';
  const text = `Hello ${fullName || 'Tenant Admin'},\n\nYour ${tier} subscription has been activated for the ${billingPeriod} billing period at ${currency}${amount.toFixed(2)}.\nActivation date: ${activatedAt}${expiresAt ? `\nExpires at: ${expiresAt}` : ''}`;

  const html = buildHtmlSection('Subscription activated', `Your <strong>${tier}</strong> subscription is active for the <strong>${billingPeriod}</strong> billing period at <strong>${currency}${amount.toFixed(2)}</strong>.<br/>Activation date: ${activatedAt}${expiresAt ? `<br/>Expires at: ${expiresAt}` : ''}`);

  return { to: email, subject, text, html };
}

export function buildSubscriptionDowngradeEmail({ email, fullName, reason }) {
  const subject = 'Your TAILORSTAQ subscription has been downgraded';
  const text = `Hello ${fullName || 'Tenant Admin'},\n\n` +
    `Your account has been downgraded to the free tier due to ${reason}.`;

  const html = buildHtmlSection('Subscription downgraded', `Your account has been downgraded to the free tier due to <strong>${reason}</strong>.`);

  return { to: email, subject, text, html };
}

export function buildTenantSuspensionEmail({ email, businessName }) {
  const subject = 'Your TAILORSTAQ account has been suspended';
  const text = `Hello ${businessName},\n\nYour TAILORSTAQ account has been suspended. You will no longer be able to access shop management features. Please contact support if you believe this is an error.`;

  const html = buildHtmlSection('Account suspended', `Your TAILORSTAQ account has been suspended. You will no longer be able to access shop management features. Please contact support if you believe this is an error.`);

  return { to: email, subject, text, html };
}

export function buildTenantReactivationEmail({ email, businessName }) {
  const subject = 'Your TAILORSTAQ account has been reactivated';
  const text = `Hello ${businessName},\n\nYour TAILORSTAQ account has been reactivated. You can now access all shop management features.`;

  const html = buildHtmlSection('Account reactivated', `Your TAILORSTAQ account has been reactivated. You can now access all shop management features.`);

  return { to: email, subject, text, html };
}
