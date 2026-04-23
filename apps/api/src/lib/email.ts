import { Resend } from 'resend'
import { OTP_CONFIG } from './otp'

let resend: Resend | null = null

function getResendClient(): Resend {
	if (!resend) {
		resend = new Resend(process.env.RESEND_API_KEY)
	}
	return resend
}

function buildOtpHtml(code: string): string {
	return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Din inloggningskod</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Tidrapport</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#3f3f46;font-size:15px;">Hej!</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;">Använd koden nedan för att logga in:</p>
              <div style="background-color:#f4f4f5;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
                <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#18181b;font-family:'Courier New',monospace;">${code}</span>
              </div>
              <p style="margin:0 0 4px;color:#71717a;font-size:13px;">Koden är giltig i ${OTP_CONFIG.expiryMinutes} minuter.</p>
              <p style="margin:0;color:#71717a;font-size:13px;">Om du inte försökte logga in kan du ignorera detta mail.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;text-align:center;">Tidrapport &mdash; Tidsrapportering</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendLoginCodeEmail(
	email: string,
	code: string,
): Promise<void> {
	const emailFrom = process.env.EMAIL_FROM || 'noreply@example.com'
	const { error } = await getResendClient().emails.send({
		from: emailFrom,
		to: email,
		subject: `${code} — Din inloggningskod`,
		html: buildOtpHtml(code),
	})

	if (error) {
		console.error('[EMAIL] Failed to send login code email:', error)
		throw new Error(`Failed to send email: ${error.message}`)
	}
}

function buildSecurityAlertHtml(reason: string): string {
	return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Säkerhetsvarning</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#b91c1c;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Tidrapport — Säkerhetsvarning</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Hej,</p>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">${reason}</p>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Som säkerhetsåtgärd har alla aktiva sessioner loggats ut. Logga in igen via mail-koden för att fortsätta.</p>
              <p style="margin:0;color:#71717a;font-size:13px;">Om det var du kan du ignorera detta mail. Om inte, kontrollera att ingen annan använder din e-post.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;text-align:center;">Tidrapport &mdash; Tidsrapportering</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Skickar en säkerhetsvarning till användaren. I dev/test loggas den bara
 * till konsolen. Kastar aldrig vidare — ett misslyckat säkerhetsmail ska
 * inte blockera själva säkerhetsåtgärden (t.ex. invalidering av sessioner).
 */
export async function sendSecurityAlertEmail(
	email: string,
	reason: string,
): Promise<void> {
	const isDev =
		!process.env.NODE_ENV ||
		process.env.NODE_ENV === 'development' ||
		process.env.NODE_ENV === 'test'

	if (isDev) {
		console.log(`[SECURITY-ALERT] Would send to ${email}: ${reason}`)
		return
	}

	const emailFrom = process.env.EMAIL_FROM || 'noreply@example.com'
	try {
		const { error } = await getResendClient().emails.send({
			from: emailFrom,
			to: email,
			subject: 'Säkerhetsvarning — dina sessioner har loggats ut',
			html: buildSecurityAlertHtml(reason),
		})
		if (error) {
			console.error('[EMAIL] Failed to send security alert:', error)
		}
	} catch (err) {
		console.error('[EMAIL] Exception sending security alert:', err)
	}
}

export { buildOtpHtml }
