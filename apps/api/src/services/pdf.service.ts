import PDFDocument from 'pdfkit'

interface DailyEntry {
	date: string
	minutes: number
	projects: string[]
}

interface PdfReportData {
	email: string
	year: number
	month: number
	dailyHours: DailyEntry[]
	totalMinutes: number
	generatedAt: string
}

const SWEDISH_MONTHS = [
	'januari',
	'februari',
	'mars',
	'april',
	'maj',
	'juni',
	'juli',
	'augusti',
	'september',
	'oktober',
	'november',
	'december',
]

function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export class PdfService {
	async generateMonthlyReport(data: PdfReportData): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const doc = new PDFDocument({ margin: 50, size: 'A4' })
			const chunks: Buffer[] = []

			doc.on('data', (chunk: Buffer) => chunks.push(chunk))
			doc.on('end', () => resolve(Buffer.concat(chunks)))
			doc.on('error', reject)

			const monthName = SWEDISH_MONTHS[data.month - 1]

			// Title
			doc.fontSize(20).text('Tidrapport', { align: 'center' })
			doc.moveDown(0.5)
			doc.fontSize(14).text(`${monthName} ${data.year}`, { align: 'center' })
			doc.moveDown(1.5)

			// Meta info
			doc.fontSize(10)
			doc.text(`Genererad: ${data.generatedAt}`)
			doc.text(`Användare: ${data.email}`)
			doc.text(`Period: ${monthName} ${data.year}`)
			doc.moveDown(1)

			// Table header
			const tableLeft = 50
			const colDate = tableLeft
			const colHours = tableLeft + 200
			const colProject = tableLeft + 300

			doc.fontSize(10).font('Helvetica-Bold')
			doc.text('Datum', colDate, doc.y)
			doc.text('Tid', colHours, doc.y - doc.currentLineHeight())
			doc.text('Projekt', colProject, doc.y - doc.currentLineHeight())
			doc.moveDown(0.3)

			// Divider line
			const lineY = doc.y
			doc
				.moveTo(tableLeft, lineY)
				.lineTo(tableLeft + 450, lineY)
				.stroke()
			doc.moveDown(0.3)

			// Table rows
			doc.font('Helvetica')
			for (const entry of data.dailyHours) {
				const y = doc.y
				doc.text(entry.date, colDate, y)
				doc.text(formatMinutes(entry.minutes), colHours, y)
				doc.text(entry.projects.join(', '), colProject, y, {
					width: 200,
				})
				doc.moveDown(0.3)
			}

			if (data.dailyHours.length === 0) {
				doc.text('Inga tidrapporter för denna period.', colDate)
				doc.moveDown(0.5)
			}

			// Divider before total
			doc.moveDown(0.3)
			const totalLineY = doc.y
			doc
				.moveTo(tableLeft, totalLineY)
				.lineTo(tableLeft + 450, totalLineY)
				.stroke()
			doc.moveDown(0.5)

			// Total
			doc.font('Helvetica-Bold')
			doc.text(`Total: ${formatMinutes(data.totalMinutes)}`, colDate)

			doc.end()
		})
	}
}

export const pdfService = new PdfService()
