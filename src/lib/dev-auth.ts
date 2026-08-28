/**
 * Local email/password auth is deliberately opt-in. Checking NODE_ENV as well
 * as the flag means a production deployment cannot enable it accidentally by
 * inheriting a development environment file.
 */
export const isDevEmailPasswordSignInEnabled =
	process.env.NODE_ENV === "development" &&
	process.env.DEV_EMAIL_PASSWORD_SIGN_IN === "true";
