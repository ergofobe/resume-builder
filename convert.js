#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { convertToPdf } = require('./pdf-converter');
const Spinner = require('./spinner');

async function main() {
  const spinner = new Spinner('Converting to PDF...');
  
  try {
    // Get input and output paths from command line arguments
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error('Usage: node convert.js <input.md> [output.pdf]');
      process.exit(1);
    }

    const inputPath = args[0];
    const outputPath = args[1] || inputPath.replace(/\.md$/, '.pdf');

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file '${inputPath}' does not exist`);
      process.exit(1);
    }

    // Validate input file extension
    if (!inputPath.endsWith('.md')) {
      console.error('Error: Input file must have .md extension');
      process.exit(1);
    }

    // Start the spinner and convert the file
    spinner.start();
    await convertToPdf(inputPath, outputPath);
    spinner.stop();
    console.log(`Successfully converted ${inputPath} to ${outputPath}`);
  } catch (error) {
    spinner.stop();
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main(); 