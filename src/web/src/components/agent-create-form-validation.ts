export interface AgentCreateRequiredFields {
  name: string;
  runtimeId: string;
}

export interface AgentCreateFieldErrors {
  name?: string;
  runtimeId?: string;
}

export function validateAgentCreateRequiredFields({
  name,
  runtimeId,
}: AgentCreateRequiredFields): AgentCreateFieldErrors {
  const errors: AgentCreateFieldErrors = {};

  if (!name.trim()) {
    errors.name = "Name is required";
  }

  if (!runtimeId) {
    errors.runtimeId = "Select an online runtime";
  }

  return errors;
}

export function hasAgentCreateFieldErrors(
  errors: AgentCreateFieldErrors,
): boolean {
  return Boolean(errors.name || errors.runtimeId);
}
