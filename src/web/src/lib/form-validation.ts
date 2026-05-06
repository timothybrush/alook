export interface WorkspaceFormValidationInput {
  name: string;
  slug: string;
}

export interface WorkspaceFormErrors {
  name?: string;
  slug?: string;
}

export function validateWorkspaceForm({
  name,
  slug,
}: WorkspaceFormValidationInput): WorkspaceFormErrors {
  const errors: WorkspaceFormErrors = {};

  if (!name.trim()) {
    errors.name = "Workspace name is required";
  }

  if (!slug.trim()) {
    errors.slug = "Workspace slug is required";
  }

  return errors;
}

export function hasWorkspaceFormErrors(errors: WorkspaceFormErrors): boolean {
  return Boolean(errors.name || errors.slug);
}

export interface CustomEmailValidationInput {
  emailAddress: string;
  imapHost: string;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpUsername: string;
  smtpPassword: string;
}

export interface CustomEmailErrors {
  emailAddress?: string;
  imapHost?: string;
  imapPassword?: string;
  smtpHost?: string;
  smtpPassword?: string;
}

export function validateCustomEmailFields({
  emailAddress,
  imapHost,
  imapUsername,
  imapPassword,
  smtpHost,
  smtpUsername,
  smtpPassword,
}: CustomEmailValidationInput): CustomEmailErrors {
  const errors: CustomEmailErrors = {};

  if (!emailAddress.trim()) {
    errors.emailAddress = "Email address is required";
  }

  if (!imapHost.trim()) {
    errors.imapHost = "IMAP host is required";
  }

  if (!imapUsername.trim() || !imapPassword.trim()) {
    errors.imapPassword = "IMAP credentials are required";
  }

  if (!smtpHost.trim()) {
    errors.smtpHost = "SMTP host is required";
  }

  if (!smtpUsername.trim() || !smtpPassword.trim()) {
    errors.smtpPassword = "SMTP credentials are required";
  }

  return errors;
}

export function hasCustomEmailErrors(errors: CustomEmailErrors): boolean {
  return Boolean(
    errors.emailAddress ||
      errors.imapHost ||
      errors.imapPassword ||
      errors.smtpHost ||
      errors.smtpPassword,
  );
}
