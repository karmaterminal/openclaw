const SESSION_IDENTITY_CONFLICT_ERROR_CODE = "session_identity_conflict";

export function isSessionIdentityConflictError(
  error: unknown,
): error is { code: typeof SESSION_IDENTITY_CONFLICT_ERROR_CODE; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === SESSION_IDENTITY_CONFLICT_ERROR_CODE &&
    "message" in error &&
    typeof error.message === "string"
  );
}
