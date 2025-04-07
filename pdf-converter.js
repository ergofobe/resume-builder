const fs = require('fs');
const PDFDocument = require('pdfkit');
const path = require('path');

// Function to convert Markdown to PDF
async function convertToPdf(inputPath, outputPath) {
  try {
    // Read the Markdown file
    const markdownContent = await fs.promises.readFile(inputPath, 'utf8');

    // Create a PDF document with initial settings
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50
      },
      bufferPages: true  // Enable page buffering during document creation
    });

    // Create write stream
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Default styles
    const styles = {
      h1: { font: 'Helvetica-Bold', size: 24, color: '#2c3e50', spacing: 4 },   // Main title (minimal spacing)
      h2: { font: 'Helvetica-Bold', size: 14, color: '#2980b9', spacing: 8, preSpacing: 10 },   // Section headers (with space before)
      h3: { font: 'Helvetica-Bold', size: 12, color: '#3498db', spacing: 4 },   // Subsection headers (lighter blue)
      normal: { font: 'Helvetica', size: 12, color: '#333333', spacing: 5 },    // Regular text
      bullet: { indent: 10, marker: '-' },                                       // Bullet points
      footer: { font: 'Helvetica', size: 10, color: '#666666' },                // Footer text
      link: { color: '#2c3e50', underline: false }                              // Link styling
    };

    // Set initial default style
    doc.font(styles.normal.font)
       .fontSize(styles.normal.size)
       .fillColor(styles.normal.color)
       .lineGap(styles.normal.spacing);

    // Process the markdown content line by line
    const lines = markdownContent.split('\n');
    
    for (let line of lines) {
      if (!line.trim()) continue; // Skip empty lines

      // Handle line based on Markdown syntax
      if (line.startsWith('# ')) {
        // h1 - Main title
        doc.font(styles.h1.font)
           .fontSize(styles.h1.size)
           .fillColor(styles.h1.color)
           .text(line.substring(2), { paragraphGap: styles.h1.spacing });
      }
      else if (line.startsWith('## ')) {
        // h2 - Section headers
        const currentHeight = doc.y;
        const pageHeight = doc.page.height - doc.page.margins.bottom - 30; // Account for footer
        const lineHeight = doc.currentLineHeight();
        
        // Calculate space needed for header and minimum content
        const headerText = line.substring(3);
        const headerHeight = doc.heightOfString(headerText, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right
        });
        const spaceNeeded = headerHeight + (lineHeight * 3);

        // Add new page if needed
        if (currentHeight + spaceNeeded > pageHeight) {
          doc.addPage();
          doc.y = doc.page.margins.top;
        }

        // Add pre-header spacing if not at top of page
        if (doc.y > doc.page.margins.top) {
          doc.moveDown(styles.h2.preSpacing / doc.currentLineHeight());
        }

        doc.font(styles.h2.font)
           .fontSize(styles.h2.size)
           .fillColor(styles.h2.color)
           .text(headerText, {
             paragraphGap: styles.h2.spacing,
             continued: false
           });
      }
      else if (line.startsWith('### ')) {
        // h3 - Subsection headers
        const currentHeight = doc.y;
        const pageHeight = doc.page.height - doc.page.margins.bottom - 30;
        const lineHeight = doc.currentLineHeight();
        
        const headerText = line.substring(4);
        const headerHeight = doc.heightOfString(headerText, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right
        });
        const spaceNeeded = headerHeight + (lineHeight * 3);

        if (currentHeight + spaceNeeded > pageHeight) {
          doc.addPage();
          doc.y = doc.page.margins.top;
        }

        doc.font(styles.h3.font)
           .fontSize(styles.h3.size)
           .fillColor(styles.h3.color)
           .text(headerText, {
             paragraphGap: styles.h3.spacing,
             continued: false
           });
      }
      else {
        // Handle regular text and bullet points
        let textToWrite = line;
        let options = {
          paragraphGap: styles.normal.spacing,
          align: line.startsWith('- ') ? 'left' : 'justify',  // Only justify non-bullet text
          indent: line.startsWith('- ') ? styles.bullet.indent : 0
        };

        // Set up normal text style
        doc.font(styles.normal.font)
           .fontSize(styles.normal.size)
           .fillColor(styles.normal.color);

        if (line.startsWith('- ')) {
          textToWrite = styles.bullet.marker + ' ' + line.substring(2);
        }

        // Split only on markdown formatting
        let parts = textToWrite.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*|https?:\/\/\S+)/g);
        parts = parts.filter(Boolean);

        // Process each part
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          options.continued = i < parts.length - 1;

          if (part.match(/^\[.*?\]\(.*?\)$/)) {
            // Markdown link
            const [, text, url] = part.match(/\[(.*?)\]\((.*?)\)/);
            doc.fillColor(styles.link.color)
               .text(text, { ...options, link: url, underline: styles.link.underline })
               .fillColor(styles.normal.color);
          }
          else if (part.match(/^https?:\/\/\S+$/)) {
            // URL
            const url = part.replace(/[.,;:!?]$/, '');
            doc.fillColor(styles.link.color)
               .text(url, { ...options, link: url, underline: styles.link.underline })
               .fillColor(styles.normal.color);
          }
          else if (part.match(/^\*\*.*\*\*$/)) {
            // Bold text
            doc.font(styles.h1.font)
               .text(part.slice(2, -2), options)
               .font(styles.normal.font);
          }
          else {
            // Regular text
            doc.text(part, options);
          }
        }
      }

      // Reset style after each line
      doc.font(styles.normal.font)
         .fontSize(styles.normal.size)
         .fillColor(styles.normal.color);
    }

    // Add page numbers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      
      // Temporarily remove bottom margin to write into it
      let oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      // Add page number
      doc.font(styles.footer.font)
         .fontSize(styles.footer.size)
         .fillColor(styles.footer.color);

      const text = `Page ${i + 1} of ${range.count}`;
      doc.text(
        text,
        0,
        doc.page.height - (oldBottomMargin / 2),  // Center vertically in bottom margin
        { 
          align: 'center',  // Center horizontally
          width: doc.page.width
        }
      );

      // Restore bottom margin
      doc.page.margins.bottom = oldBottomMargin;
    }

    // Return a promise that resolves when the PDF is fully written
    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        resolve();
      });
      writeStream.on('error', (error) => {
        reject(error);
      });
      doc.end();
    });
  } catch (error) {
    throw error;
  }
}

module.exports = {
  convertToPdf
}; 