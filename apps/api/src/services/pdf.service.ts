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

const SWEDISH_WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']

function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function formatSwedishDate(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00Z`)
	const weekday = SWEDISH_WEEKDAYS[d.getUTCDay()]
	const day = d.getUTCDate()
	return `${weekday} ${day}`
}

// Layout constants
const PAGE_MARGIN = 50
const TABLE_LEFT = PAGE_MARGIN
const TABLE_WIDTH = 495
const COL_DATE_W = 80
const COL_HOURS_W = 80
const COL_PROJECT_W = TABLE_WIDTH - COL_DATE_W - COL_HOURS_W
const ROW_HEIGHT = 22
const HEADER_COLOR = '#2c3e50'
const ACCENT_COLOR = '#3498db'
const LIGHT_BG = '#f8f9fa'
const BORDER_COLOR = '#dee2e6'

export class PdfService {
	async generateMonthlyReport(data: PdfReportData): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' })
			const chunks: Buffer[] = []

			doc.on('data', (chunk: Buffer) => chunks.push(chunk))
			doc.on('end', () => resolve(Buffer.concat(chunks)))
			doc.on('error', reject)

			const monthName = SWEDISH_MONTHS[data.month - 1]

			this.drawHeader(doc, monthName, data)
			this.drawTable(doc, data.dailyHours, monthName)
			this.drawTotal(doc, data.totalMinutes)
			this.drawFooter(doc, data.generatedAt)

			doc.end()
		})
	}

	private drawHeader(
		doc: PDFKit.PDFDocument,
		monthName: string,
		data: PdfReportData,
	) {
		// Accent line at top
		doc
			.moveTo(PAGE_MARGIN, PAGE_MARGIN)
			.lineTo(PAGE_MARGIN + TABLE_WIDTH, PAGE_MARGIN)
			.lineWidth(3)
			.strokeColor(ACCENT_COLOR)
			.stroke()

		doc.y = PAGE_MARGIN + 12

		// Title
		doc
			.fontSize(22)
			.font('Helvetica-Bold')
			.fillColor(HEADER_COLOR)
			.text('Tidrapport', { align: 'center' })

		// Subtitle: month and year
		doc
			.fontSize(13)
			.font('Helvetica')
			.fillColor('#555555')
			.text(
				`${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${data.year}`,
				{ align: 'center' },
			)
		doc.moveDown(1.2)

		// Info box
		const boxTop = doc.y
		const boxHeight = 48
		doc
			.rect(TABLE_LEFT, boxTop, TABLE_WIDTH, boxHeight)
			.fillColor(LIGHT_BG)
			.fill()
		doc
			.rect(TABLE_LEFT, boxTop, TABLE_WIDTH, boxHeight)
			.strokeColor(BORDER_COLOR)
			.lineWidth(0.5)
			.stroke()

		const infoY = boxTop + 10
		doc.fontSize(9).font('Helvetica').fillColor('#333333')
		doc.text(`Användare: ${data.email}`, TABLE_LEFT + 14, infoY)
		doc.text(`Period: ${monthName} ${data.year}`, TABLE_LEFT + 14, infoY + 15)
		doc.text(`Genererad: ${data.generatedAt}`, TABLE_LEFT + 280, infoY)
		doc.text(
			`Antal dagar: ${data.dailyHours.length}`,
			TABLE_LEFT + 280,
			infoY + 15,
		)

		doc.y = boxTop + boxHeight + 20
	}

	private drawTable(
		doc: PDFKit.PDFDocument,
		dailyHours: DailyEntry[],
		monthName: string,
	) {
		const colDateX = TABLE_LEFT
		const colHoursX = TABLE_LEFT + COL_DATE_W
		const colProjectX = TABLE_LEFT + COL_DATE_W + COL_HOURS_W

		// Table header
		const headerY = doc.y
		doc
			.rect(TABLE_LEFT, headerY, TABLE_WIDTH, ROW_HEIGHT)
			.fillColor(HEADER_COLOR)
			.fill()

		doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff')
		const textOffsetY = headerY + 6
		doc.text('Datum', colDateX + 8, textOffsetY)
		doc.text('Tid', colHoursX + 8, textOffsetY)
		doc.text('Projekt', colProjectX + 8, textOffsetY)

		doc.y = headerY + ROW_HEIGHT

		// Table rows
		if (dailyHours.length === 0) {
			doc
				.rect(TABLE_LEFT, doc.y, TABLE_WIDTH, ROW_HEIGHT)
				.fillColor(LIGHT_BG)
				.fill()
			doc
				.fontSize(9)
				.font('Helvetica-Oblique')
				.fillColor('#888888')
				.text(`Inga tidrapporter för ${monthName}.`, TABLE_LEFT + 8, doc.y + 6)
			doc.y += ROW_HEIGHT
		} else {
			for (let i = 0; i < dailyHours.length; i++) {
				const entry = dailyHours[i]
				const rowY = doc.y

				// Check for page break
				if (rowY + ROW_HEIGHT > 750) {
					doc.addPage()
					doc.y = PAGE_MARGIN
				}

				const currentRowY = doc.y

				// Alternating row background
				if (i % 2 === 0) {
					doc
						.rect(TABLE_LEFT, currentRowY, TABLE_WIDTH, ROW_HEIGHT)
						.fillColor(LIGHT_BG)
						.fill()
				}

				// Row border bottom
				doc
					.moveTo(TABLE_LEFT, currentRowY + ROW_HEIGHT)
					.lineTo(TABLE_LEFT + TABLE_WIDTH, currentRowY + ROW_HEIGHT)
					.strokeColor(BORDER_COLOR)
					.lineWidth(0.5)
					.stroke()

				const rowTextY = currentRowY + 6
				doc.fontSize(9).font('Helvetica').fillColor('#333333')
				doc.text(formatSwedishDate(entry.date), colDateX + 8, rowTextY)
				doc.text(formatMinutes(entry.minutes), colHoursX + 8, rowTextY)
				doc.text(entry.projects.join(', '), colProjectX + 8, rowTextY, {
					width: COL_PROJECT_W - 16,
				})

				doc.y = currentRowY + ROW_HEIGHT
			}
		}

		// Column vertical lines
		const tableTop = doc.y - dailyHours.length * ROW_HEIGHT - ROW_HEIGHT
		const tableBottom = doc.y
		doc.strokeColor(BORDER_COLOR).lineWidth(0.5)
		for (const x of [
			TABLE_LEFT,
			colHoursX,
			colProjectX,
			TABLE_LEFT + TABLE_WIDTH,
		]) {
			doc.moveTo(x, tableTop).lineTo(x, tableBottom).stroke()
		}
	}

	private drawTotal(doc: PDFKit.PDFDocument, totalMinutes: number) {
		doc.y += 6
		const totalY = doc.y
		const totalHeight = 28

		doc
			.rect(TABLE_LEFT, totalY, TABLE_WIDTH, totalHeight)
			.fillColor(HEADER_COLOR)
			.fill()

		doc
			.fontSize(11)
			.font('Helvetica-Bold')
			.fillColor('#ffffff')
			.text(`Total: ${formatMinutes(totalMinutes)}`, TABLE_LEFT + 8, totalY + 7)

		doc.y = totalY + totalHeight
	}

	private drawFooter(doc: PDFKit.PDFDocument, generatedAt: string) {
		const pageBottom = 800
		doc
			.moveTo(PAGE_MARGIN, pageBottom)
			.lineTo(PAGE_MARGIN + TABLE_WIDTH, pageBottom)
			.strokeColor(BORDER_COLOR)
			.lineWidth(0.5)
			.stroke()

		doc
			.fontSize(7)
			.font('Helvetica')
			.fillColor('#999999')
			.text(
				`Tidrapport genererad ${generatedAt}`,
				PAGE_MARGIN,
				pageBottom + 6,
				{ align: 'center', width: TABLE_WIDTH },
			)
	}
}

export const pdfService = new PdfService()
