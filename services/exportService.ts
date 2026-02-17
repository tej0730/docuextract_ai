import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ExternalHyperlink } from "docx";
import saveAs from "file-saver";

// Helper to check for markdown links
const linkRegex = /\[(.*?)\]\((.*?)\)/g;

// Clean text for simple extraction (fallback)
const cleanMarkdown = (md: string) => {
  return md
    .replace(linkRegex, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#/g, '')
    .replace(/`/g, '')
    .replace(/<br>/g, '\n');
};

// --- WORD HELPERS ---
const parseMarkdownToDocxChildren = (text: string): (TextRun | ExternalHyperlink)[] => {
  const children: (TextRun | ExternalHyperlink)[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex
  linkRegex.lastIndex = 0;

  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before link
    if (match.index > lastIndex) {
      children.push(new TextRun({ text: text.substring(lastIndex, match.index) }));
    }

    // Add Link
    children.push(
      new ExternalHyperlink({
        children: [
          new TextRun({
            text: match[1],
            style: "Hyperlink",
            color: "0000FF",
            underline: {
                type: "single"
            }
          }),
        ],
        link: match[2],
      })
    );

    lastIndex = linkRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    children.push(new TextRun({ text: text.substring(lastIndex) }));
  }

  return children;
};

// --- PDF HELPERS ---
// We use a special object structure for PDF table parsing so we can use hooks to render links
interface PDFCellObj {
  content: string;
  link?: string;
}

const parseCellForPDF = (text: string): PDFCellObj | string => {
  const match = text.match(/^\[(.*?)\]\((.*?)\)$/); // Matches strict [Text](Url) whole cell
  if (match) {
    return { content: match[1], link: match[2] };
  }
  // Remove markdown from text if no link
  return text.replace(/\*\*/g, '').replace(/<br>/g, '\n');
};

export const exportToPDF = (content: string, filename: string = "extraction-report") => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxLineWidth = pageWidth - margin * 2;
  
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text("DocuExtract AI Report", margin, 20);
  
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.line(margin, 24, pageWidth - margin, 24);

  let y = 35;
  const lines = content.split('\n');

  let inTable = false;
  let tableHeader: string[] = [];
  let tableBody: (string | PDFCellObj)[][] = [];

  const flushTable = () => {
    if (tableHeader.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [tableHeader],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3, textColor: [51, 65, 85], overflow: 'linebreak' },
        margin: { left: margin, right: margin },
        didDrawCell: (data) => {
          // Check if this cell data has a link property (passed via parseCellForPDF)
          // We cast data.cell.raw because autoTable stores the input object there
          const raw = data.cell.raw as PDFCellObj;
          if (raw && typeof raw === 'object' && raw.link) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: raw.link });
            // Optional: You could recolor the text here, but autoTable is tricky with recoloring drawn text.
            // Simpler to rely on the fact that we can set styles in `willDrawCell` if needed, 
            // but link annotation is the functional part.
          }
        },
        willDrawCell: (data) => {
           const raw = data.cell.raw as PDFCellObj;
           if (raw && typeof raw === 'object' && raw.link) {
               doc.setTextColor(0, 0, 255); // Blue color for links
           } else {
               if (data.section === 'body') doc.setTextColor(51, 65, 85);
           }
        }
      });
      // @ts-ignore
      y = doc.lastAutoTable.finalY + 10; 
      tableHeader = [];
      tableBody = [];
    }
    inTable = false;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    if (trimmed.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHeader = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim().replace(/\*\*/g, ''));
      } else {
        if (!trimmed.includes('---')) {
          const rowStrings = trimmed.split('|').filter(c => c.trim() !== '');
          const rowData = rowStrings.map(c => parseCellForPDF(c.trim()));
          tableBody.push(rowData);
        }
      }
      return;
    } else {
      if (inTable) flushTable();
    }

    // Standard Text Handling
    if (trimmed.startsWith('# ')) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59);
        doc.text(trimmed.replace('# ', ''), margin, y);
        y += 10;
    } else if (trimmed.startsWith('## ')) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(51, 65, 85);
        doc.text(trimmed.replace('## ', ''), margin, y);
        y += 8;
    } else if (trimmed.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        
        // Simple Link handling for body text (Not table)
        // This splits by link regex to find [Text](Link) in standard paragraphs
        const parts = trimmed.split(linkRegex);
        // parts array: [pre-text, linkText, linkUrl, post-text, ...]
        
        let currentX = margin;
        
        // Basic naive line drawing for text with links (Does not handle multi-line wrapping perfectly, but good for headings/lists)
        if (parts.length > 1) {
             let cursorX = margin;
             linkRegex.lastIndex = 0;
             let match;
             let lastIdx = 0;
             
             // We iterate manually to handle drawing
             while ((match = linkRegex.exec(trimmed)) !== null) {
                 // Draw text before
                 const preText = trimmed.substring(lastIdx, match.index);
                 if (preText) {
                     doc.setTextColor(71, 85, 105);
                     doc.text(preText, cursorX, y);
                     cursorX += doc.getTextWidth(preText);
                 }
                 
                 // Draw Link
                 const linkText = match[1];
                 const linkUrl = match[2];
                 doc.setTextColor(0, 0, 255);
                 doc.textWithLink(linkText, cursorX, y, { url: linkUrl });
                 cursorX += doc.getTextWidth(linkText);
                 
                 lastIdx = linkRegex.lastIndex;
             }
             // Draw text after last link
             if (lastIdx < trimmed.length) {
                 doc.setTextColor(71, 85, 105);
                 doc.text(trimmed.substring(lastIdx), cursorX, y);
             }
             y += 6;
        } else {
             // Normal text wrap
             const clean = cleanMarkdown(trimmed);
             const textLines = doc.splitTextToSize(clean, maxLineWidth);
             doc.text(textLines, margin, y);
             y += (textLines.length * 5) + 2;
        }
    }
  });

  if (inTable) flushTable();

  doc.save(`${filename}.pdf`);
};

export const exportToWord = async (content: string, filename: string = "extraction-report") => {
    const lines = content.split('\n');
    const children: any[] = [];

    children.push(
        new Paragraph({
            text: "DocuExtract AI Report",
            heading: HeadingLevel.TITLE,
        })
    );

    let inTable = false;
    let tableRows: TableRow[] = [];

    const flushTable = () => {
        if (tableRows.length > 0) {
             children.push(new Table({ 
                 rows: tableRows, 
                 width: { size: 100, type: WidthType.PERCENTAGE }
            }));
            children.push(new Paragraph({ text: "" }));
        }
        inTable = false;
        tableRows = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Headings
        if (line.startsWith('### ')) {
            if(inTable) flushTable();
            children.push(new Paragraph({
                children: parseMarkdownToDocxChildren(line.replace('### ', '')),
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 100 }
            }));
            continue;
        }
        if (line.startsWith('## ')) {
             if(inTable) flushTable();
             children.push(new Paragraph({
                children: parseMarkdownToDocxChildren(line.replace('## ', '')),
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            continue;
        }
        if (line.startsWith('# ')) {
             if(inTable) flushTable();
             children.push(new Paragraph({
                children: parseMarkdownToDocxChildren(line.replace('# ', '')),
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }));
            continue;
        }

        // Tables
        if (line.startsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            if (line.includes('---')) continue;

            const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
            const rowCells = cells.map(text => {
                // Remove bold for clean processing but parse links
                const cleanText = text.replace(/\*\*/g, '').replace(/<br>/g, '\n');
                return new TableCell({
                    children: [
                        new Paragraph({
                            children: parseMarkdownToDocxChildren(cleanText)
                        })
                    ],
                    width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
                        left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
                        right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
                    },
                    shading: {
                        fill: tableRows.length === 0 ? "F1F5F9" : "FFFFFF"
                    }
                });
            });
            tableRows.push(new TableRow({ children: rowCells }));
        } else {
            if (inTable) flushTable();

            if (line.length > 0) {
                children.push(new Paragraph({
                    children: parseMarkdownToDocxChildren(line),
                    spacing: { after: 120 }
                }));
            }
        }
    }
    
    if (inTable) flushTable();

    const doc = new Document({
        styles: {
            characterStyles: [
                {
                    id: "Hyperlink",
                    name: "Hyperlink",
                    basedOn: "Default Paragraph Font",
                    run: {
                        color: "0000FF",
                        underline: {
                            type: "single",
                        },
                    },
                },
            ],
        },
        sections: [{
            properties: {},
            children: children,
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${filename}.docx`);
};