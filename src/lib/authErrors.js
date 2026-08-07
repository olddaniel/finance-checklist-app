// Supabase's own messages are English and fairly technical; map the ones a
// person actually hits. Shared by the sign-in and password-reset screens, which
// hit the same errors from different calls.
//
// The fallback is deliberately generic pt-BR rather than the raw string: an
// English sentence about a "provider" or a "claim" tells nobody anything, and
// this app is only ever read in Portuguese.
export function friendlyError(message = "") {
  const m = String(message).toLowerCase();

  // This project has no SMTP server, so the built-in sender's low ceiling is the
  // single most likely failure of the reset flow. Say how long, when it says.
  if (m.includes("for security purposes") || m.includes("only request this after")) {
    const seconds = /after (\d+) second/.exec(m)?.[1];
    return seconds
      ? `Aguarde ${seconds} segundos antes de pedir outro e-mail.`
      : "Aguarde um pouco antes de pedir outro e-mail.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "Limite de envio de e-mails atingido. Espere alguns minutos e tente de novo.";
  }
  if (m.includes("error sending") || m.includes("smtp")) {
    return "O servidor não conseguiu enviar o e-mail. Tente de novo em alguns minutos.";
  }
  if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("signup_disabled")) {
    return "A criação de contas está desativada no servidor.";
  }
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "Já existe uma conta com esse e-mail. Tente entrar.";
  }
  if (m.includes("new password should be different")) return "A nova senha precisa ser diferente da atual.";
  if (m.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("email address") && m.includes("invalid")) return "E-mail inválido.";
  if (m.includes("expired") || m.includes("auth session missing")) {
    return "O link expirou ou já foi usado. Peça um novo e-mail de recuperação.";
  }
  if (m.includes("confirm")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão com o servidor.";
  return "Não foi possível continuar. Tente de novo em alguns instantes.";
}
