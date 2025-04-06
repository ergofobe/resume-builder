const fs = require('fs').promises;
const readline = require('readline');
const axios = require('axios');
const MarkdownIt = require('markdown-it');
const pdf = require('html-pdf');

// Configuration
let config;
try {
  config = require('./config.json');
  if (!config.aiApiKey || config.aiApiKey === 'YOUR_AI_API_KEY') {
    throw new Error('Please set your AI API key in config.json');
  }
  if (!config.aiApiUrl) {
    throw new Error('Please set the AI API URL in config.json');
  }
  if (!config.aiModel) {
    throw new Error('Please set the AI model in config.json');
  }
} catch (error) {
  console.error('Error reading config.json:', error.message);
  process.exit(1);
}

const MASTER_RESUME_PATH = 'master-resume.md';
const CSS_PATH = 'resume.css';
const OUTPUT_MD_PATH = 'tailored-resume.md';
const OUTPUT_PDF_PATH = 'tailored-resume.pdf';

// Setup readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Initialize markdown-it
const md = new MarkdownIt();

// Function to check if a file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Function to read the master resume
async function readMasterResume() {
  if (!(await fileExists(MASTER_RESUME_PATH))) {
    console.error(`Error: ${MASTER_RESUME_PATH} not found.`);
    process.exit(1);
  }
  try {
    return await fs.readFile(MASTER_RESUME_PATH, 'utf8');
  } catch (error) {
    console.error('Error reading master resume:', error);
    process.exit(1);
  }
}

// Function to verify CSS file existence
async function verifyCssFile() {
  if (!(await fileExists(CSS_PATH))) {
    console.error(`Error: ${CSS_PATH} not found. Please ensure it exists in the directory.`);
    process.exit(1);
  }
}

// Function to prompt user for job description
function getJobDescription() {
  return new Promise((resolve) => {
    rl.question('Please enter the job title and description (or paste the job posting):\n', (input) => {
      resolve(input.trim());
      rl.close();
    });
  });
}

// Function to call AI API
async function generateTailoredResume(masterResume, jobDescription) {
  const prompt = `
    You are an expert resume writer specializing in ATS-compatible resumes. Using the master resume provided below and the job description entered by the user, create a tailored resume in Markdown format. Follow these guidelines:
    - Use standard Markdown syntax with clear section headings (e.g., "#", "##") for ATS compatibility and PDF conversion.
    - Avoid complex formatting, tables, or special characters beyond basic Markdown (e.g., bold, italics).
    - Optimize for keywords from the job description without fabricating information.
    - Include only relevant skills and experiences from the master resume.
    - Keep the tone professional and concise.
    - Structure sections as: Contact Information, Summary, Skills, Experience.
    - Do not hallucinate details; use only the content from the master resume.

    Master Resume:
    ${masterResume}

    Job Description:
    ${jobDescription}

    Output the resume in Markdown format below:
  `;

  try {
    const response = await axios.post(config.aiApiUrl, {
      prompt: prompt,
      max_tokens: 2000, // Adjust based on API limits
      temperature: 0.7, // Balanced creativity and accuracy
      model: config.aiModel
    }, {
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].text.trim(); // Adjust based on API response structure
  } catch (error) {
    console.error('Error calling AI API:', error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

// Function to save the tailored resume in Markdown
async function saveTailoredResumeMd(resumeContent) {
  try {
    await fs.writeFile(OUTPUT_MD_PATH, resumeContent, 'utf8');
    console.log(`Tailored resume saved as Markdown to ${OUTPUT_MD_PATH}`);
  } catch (error) {
    console.error('Error saving tailored resume Markdown:', error);
    process.exit(1);
  }
}

// Function to convert Markdown to PDF
async function convertToPdf() {
  try {
    // Read the Markdown file
    const markdownContent = await fs.readFile(OUTPUT_MD_PATH, 'utf8');

    // Convert Markdown to HTML
    const htmlContent = md.render(markdownContent);

    // Read the CSS file
    const cssContent = await fs.readFile(CSS_PATH, 'utf8');

    // Combine HTML with CSS
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${cssContent}</style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    // PDF conversion options
    const options = {
      format: 'Letter',
      border: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    };

    // Convert to PDF
    return new Promise((resolve, reject) => {
      pdf.create(fullHtml, options).toFile(OUTPUT_PDF_PATH, (err) => {
        if (err) {
          console.error('Error converting to PDF:', err);
          reject(err);
        } else {
          console.log(`Tailored resume saved as PDF to ${OUTPUT_PDF_PATH}`);
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Error during PDF conversion process:', error);
    process.exit(1);
  }
}

// Main function to run the script
async function main() {
  console.log('Starting resume generation process...');

  // Verify CSS file exists
  await verifyCssFile();

  // Read the master resume
  const masterResume = await readMasterResume();

  // Get job description from user
  const jobDescription = await getJobDescription();

  // Generate tailored resume using AI API
  const tailoredResume = await generateTailoredResume(masterResume, jobDescription);

  // Save the tailored resume as Markdown
  await saveTailoredResumeMd(tailoredResume);

  // Convert to PDF
  console.log('Converting Markdown to PDF...');
  await convertToPdf();

  console.log('Resume generation and conversion complete!');
  process.exit(0);
}

// Run the script
main();