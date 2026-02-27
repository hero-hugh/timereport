import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('resend', () => ({
	Resend: vi.fn().mockImplementation(() => ({
		emails: { send: sendMock },
	})),
}))

import { buildOtpHtml, sendLoginCodeEmail } from './email'

describe('email', () => {
	beforeEach(() => {
		sendMock.mockReset()
	})

	describe('buildOtpHtml', () => {
		it('should include the OTP code in the HTML', () => {
			const html = buildOtpHtml('123456')
			expect(html).toContain('123456')
		})

		it('should include expiry time info', () => {
			const html = buildOtpHtml('999999')
			expect(html).toContain('10 minuter')
		})

		it('should be a complete HTML document', () => {
			const html = buildOtpHtml('123456')
			expect(html).toContain('<!DOCTYPE html>')
			expect(html).toContain('</html>')
		})

		it('should include app branding', () => {
			const html = buildOtpHtml('123456')
			expect(html).toContain('Tidrapport')
		})
	})

	describe('sendLoginCodeEmail', () => {
		it('should call resend with correct parameters', async () => {
			sendMock.mockResolvedValue({ data: { id: 'test-id' }, error: null })

			await sendLoginCodeEmail('user@example.com', '123456')

			expect(sendMock).toHaveBeenCalledWith(
				expect.objectContaining({
					to: 'user@example.com',
					subject: expect.stringContaining('123456'),
					html: expect.stringContaining('123456'),
				}),
			)
		})

		it('should throw when resend returns an error', async () => {
			sendMock.mockResolvedValue({
				data: null,
				error: { message: 'Invalid API key', name: 'validation_error' },
			})

			await expect(
				sendLoginCodeEmail('user@example.com', '123456'),
			).rejects.toThrow('Failed to send email: Invalid API key')
		})
	})
})
