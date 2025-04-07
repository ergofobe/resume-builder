const fsPromises = require('fs').promises;
const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const path = require('path');
const yargs = require('yargs');
const { convertToPdf } = require('./pdf-converter');
const Spinner = require('./spinner');

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

// Parse command line arguments
const argv = yargs(process.argv.slice(2))
  .option('role', {
    alias: 'r',
    description: 'Job role/title to tailor the resume for',
    type: 'string'
  })
  .option('cover', {
    alias: 'c',
    description: 'Generate a cover letter along with the resume',
    type: 'boolean'
  })
  .help()
  .alias('help', 'h')
  .parse();

// Constants
const MASTER_RESUME_PATH = 'master-resume.md';
const OUTPUT_DIR = path.join(__dirname, 'output');

// Setup readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ensure output directory exists
async function ensureOutputDirectory() {
  try {
    await fsPromises.access(OUTPUT_DIR);
  } catch {
    await fsPromises.mkdir(OUTPUT_DIR, { recursive: true });
  }
}

// Function to check if a file exists
async function fileExists(filePath) {
  try {
    await fsPromises.access(filePath);
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
    return await fsPromises.readFile(MASTER_RESUME_PATH, 'utf8');
  } catch (error) {
    console.error('Error reading master resume:', error);
    process.exit(1);
  }
}

// Function to prompt user for job description
async function getJobDescription() {
  if (argv.role) {
    // If role is provided via command line, use it directly
    return argv.role;
  } else {
    // If no role provided, ask for full job description
    return new Promise((resolve) => {
      console.log('Please paste the job description or posting.');
      console.log('When finished, enter a single "." on a new line and press Enter.');
      console.log('-----------------------------------------------------------');

      let jobDescription = '';
      
      rl.on('line', (line) => {
        if (line.trim() === '.') {
          rl.close();
          resolve(jobDescription.trim());
        } else {
          jobDescription += line + '\n';
        }
      });
    });
  }
}

// Function to generate tailored resume using AI
async function generateTailoredResume(masterResume, jobDescription) {
  const spinner = new Spinner('Generating tailored resume...');
  spinner.start();

  const prompt = `
    You are being called through an API and must respond with plaintext Markdown content only. Do not wrap your response in a code block or add any formatting markers.

    You are an expert resume writer specializing in ATS-compatible resumes. Using the master resume provided below and the job description entered by the user, create a tailored resume in Markdown format. Follow these guidelines:

    CRITICAL - Content Integrity:
    - NEVER add information that is not present in the master resume
    - NEVER create or fabricate new sections, qualifications, or details
    - NEVER add personal statements, relocation preferences, or availability notes unless they exist in the master resume
    - NEVER add meta-information or descriptive text like "(End of resume)", "Continued...", etc.
    - For ALL sections EXCEPT the Summary: ONLY include content that appears in the master resume
    - Your role is to SELECT, ARRANGE, and ADAPT content from the master resume, not to create new content
    - If a section from the master resume isn't relevant, omit it entirely - do not replace it with similar content

    Summary Section Exception:
    - You MAY rephrase and adapt the Summary section to better match the target role
    - When rewording the Summary, you must still only reference skills, experiences, and qualifications that are explicitly mentioned in the master resume
    - Do not introduce new information or capabilities not evidenced in the master resume
    - Focus on emphasizing the most relevant aspects of the candidate's background for this specific role

    Key Requirements:
    - Create a CONCISE resume that fits within 1-2 pages (maximum 3 pages)
    - Focus on the most relevant experience and skills for this specific job
    - Prioritize recent and relevant experience over older or less relevant items
    - Be selective - not everything from the master resume needs to be included
    - ONLY include sections that contain relevant information for this specific job
    - If a section (e.g., Education, Certifications, etc.) doesn't contain any information that would be valuable for this role, omit it entirely

    Contact Information Requirements:
    - IMPORTANT: Copy the exact format and style of contact information from the master resume
    - Do not rearrange or reformat the contact information section
    - Keep all contact details in the same order and format as they appear in the master resume
    - Preserve any specific formatting or line breaks used in the master resume's contact section

    Space-Saving Techniques:
    - Use comma-separated lists for dense information (skills, technologies, tools)
    - Group related items together in a single line when possible
    - Use abbreviations and acronyms where appropriate (e.g., "AWS" instead of "Amazon Web Services")
    - Keep descriptions concise and impactful
    - Use compact formatting for dates and locations
    - Combine related achievements into single statements when possible

    Formatting Guidelines:
    - Use standard Markdown syntax with clear section headings (e.g., "#", "##") for ATS compatibility
    - Avoid complex formatting, tables, or special characters beyond basic Markdown
    - Structure sections as: Contact Information, Summary, Skills, Experience, Certifications, Education (only include relevant sections)
    - Format dates as "MM/YYYY - MM/YYYY" or "MM/YYYY - Present", use just the year if month is not available
    - IMPORTANT: For professional experience entries where you include only one description/achievement, write it as a normal paragraph without using a bullet point. Only use bullet points when listing multiple items for a single role.

    Content Guidelines:
    - Optimize for keywords from the job description without keyword stuffing
    - Include only relevant skills and experiences from the master resume
    - Keep the summary/objective section brief (2-4 lines maximum)
    - Focus on achievements and impact rather than job duties
    - Do not fabricate or add information not present in the master resume
    - Trim lengthy descriptions to their essential elements
    - Use the same concise format as the master resume for similar sections
    - Omit any sections that don't directly support your candidacy for this specific role

    IMPORTANT: You are being called through an API. Respond with ONLY the plaintext Markdown content. Do not use code blocks (\`\`\`). Do not include any explanations, comments, or additional text.

    Master Resume:
    ${masterResume}

    Job Description:
    ${jobDescription}
  `;

  try {
    const response = await axios.post(config.aiApiUrl, {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: config.aiModel,
      max_tokens: config.maxTokens,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    spinner.stop();
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    spinner.stop();
    console.error('Error generating tailored resume:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to save the tailored resume in Markdown
async function saveTailoredResumeMd(resumeContent) {
  try {
    await fsPromises.writeFile(OUTPUT_MD_PATH, resumeContent, 'utf8');
    console.log(`Tailored resume saved as Markdown to ${OUTPUT_MD_PATH}`);
  } catch (error) {
    console.error('Error saving tailored resume Markdown:', error);
    process.exit(1);
  }
}

// Function to get suggested filenames and folder from AI
async function getSuggestedNames(masterResume, jobDescription, type = 'resume') {
  const spinner = new Spinner('Getting filename and folder suggestions...');
  spinner.start();

  const prompt = `
    You are being called through an API to suggest filenames and a folder name for a job application. 
    Using the contact information from the master resume and the job description provided, suggest 
    clear and professional names following these guidelines:

    CRITICAL FORMAT REQUIREMENTS:
    - Use ONLY lowercase letters, numbers, and single hyphens
    - NO spaces, underscores, periods, or special characters
    - NO numbered prefixes or suffixes
    - NO asterisks or other decorators
    - Keep names concise but descriptive (max 50 characters)
    - Format must be exactly as shown in examples below

    REQUIRED FORMAT:
    1. Folder name:  {name}-{role}-{company}
    2. Resume name:  resume-{name}-{role}-{company}
    3. Cover letter: cover-letter-{name}-{role}-{company}

    Where:
    - {name} = first initial + last name (e.g., jsmith)
    - {role} = brief role reference (e.g., solutionsarch, devops, seniordev)
    - {company} = company name, shortened if needed (e.g., yubico, google, amazon)

    EXACT EXAMPLES:
    jsmith-solutionsarch-yubico
    resume-jsmith-solutionsarch-yubico
    cover-letter-jsmith-solutionsarch-yubico

    Provide exactly three lines in this order, with no additional text or formatting:
    1. Folder name
    2. Resume name
    3. Cover letter name

    Master Resume Contact Info:
    ${masterResume.split('\n').slice(0, 10).join('\n')}

    Job Description:
    ${jobDescription}
  `;

  try {
    const response = await axios.post(config.aiApiUrl, {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: config.aiModel,
      max_tokens: config.maxTokens,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    spinner.stop();
    
    // Get the three lines and clean them
    const [folderName, resumeName, coverLetterName] = response.data.choices[0].message.content
      .trim()
      .split('\n')
      .map(line => line.trim())
      .map(line => line.replace(/[^a-z0-9-]/g, ''));  // Remove any invalid characters
    
    // Validate the names
    const isValidName = (name) => {
      return (
        name.length > 0 &&
        name.length <= 50 &&
        /^[a-z0-9-]+$/.test(name) &&  // Only lowercase letters, numbers, hyphens
        !name.includes('--') &&        // No double hyphens
        !name.startsWith('-') &&       // Doesn't start with hyphen
        !name.endsWith('-')            // Doesn't end with hyphen
      );
    };

    if (!isValidName(folderName) || !isValidName(resumeName) || !isValidName(coverLetterName)) {
      throw new Error('Invalid name format generated');
    }

    // Verify the resume and cover letter names are based on the folder name
    if (!resumeName.includes(folderName) || !coverLetterName.includes(folderName)) {
      throw new Error('Inconsistent name generation');
    }

    return {
      folder: folderName,
      resume: resumeName,
      coverLetter: coverLetterName
    };
  } catch (error) {
    spinner.stop();
    console.error('Error getting filename suggestions:', error.response ? error.response.data : error.message);
    
    // Provide clean default names if AI fails
    const timestamp = new Date().toISOString().split('T')[0];
    return {
      folder: `application-${timestamp}`,
      resume: `resume-${timestamp}`,
      coverLetter: `cover-letter-${timestamp}`
    };
  }
}

// Function to update output paths with the suggested filename
function updateOutputPaths(names, type) {
  const timestamp = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  const outputSubDir = path.join(OUTPUT_DIR, names.folder);

  // Ensure the subfolder exists
  if (!fs.existsSync(outputSubDir)) {
    fs.mkdirSync(outputSubDir, { recursive: true });
  }

  const baseName = type === 'resume' ? names.resume : names.coverLetter;
  const fullName = `${baseName}-${timestamp}`;

  return {
    md: path.join(outputSubDir, `${fullName}.md`),
    pdf: path.join(outputSubDir, `${fullName}.pdf`),
    txt: path.join(outputSubDir, `${fullName}.txt`)
  };
}

// Function to wrap text at specified width
function wrapText(text, width = 80) {
  return text.split('\n').map(line => {
    if (line.length <= width) return line;
    
    const words = line.split(' ');
    let wrappedLine = '';
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        wrappedLine += (wrappedLine ? '\n' : '') + currentLine;
        currentLine = word;
      }
    }
    
    return wrappedLine + (wrappedLine ? '\n' : '') + currentLine;
  }).join('\n');
}

// Function to generate cover letter using AI
async function generateCoverLetter(masterResume, jobDescription) {
  const spinner = new Spinner('Generating tailored cover letter...');
  spinner.start();

  // Extract contact information from the first few lines of the resume
  const contactLines = masterResume.split('\n').slice(0, 10).join('\n');
  
  // Format today's date as MM/DD/YYYY
  const today = new Date();
  const formattedDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;

  const prompt = `
    You are being called through an API to generate a professional cover letter. 
    Using ONLY the information from the master resume, create a cover letter that 
    highlights how the candidate's actual experience and skills align with the job requirements.

    CRITICAL REQUIREMENTS:
    1. SOURCE OF INFORMATION:
       - For the BODY of the letter: ONLY use information that is explicitly stated in the master resume
       - For ADDRESSING the letter: You MAY use information from the job description to identify the hiring manager and/or recruiter
       - DO NOT make any assumptions about the candidate's abilities or background
       - DO NOT add any new information or embellish existing information

    2. SKILL MATCHING:
       - ONLY highlight skills and experiences that are explicitly mentioned in the master resume
       - If the job description mentions requirements that aren't in the resume, DO NOT claim the candidate has those skills
       - Focus on how the candidate's actual skills (from resume) could be valuable in this role
       - Be honest about what the candidate brings to the table based on their resume

    3. FORMATTING:
       - DO NOT wrap the response in a code block or markdown formatting
       - DO NOT include any meta-information or comments about the letter
       - Follow the exact format requirements below

    EXACT FORMAT REQUIREMENTS:
    1. Start with the candidate's contact information exactly as it appears in the resume
    2. Add a blank line
    3. Add the date: ${formattedDate}
    4. Add a blank line
    5. Add the company address if available in the job description, otherwise skip
    6. Add a blank line
    7. Add the greeting following these exact rules:
       - If hiring manager name is known: "Dear [Hiring Manager Name],"
       - If only recruiter name is known: "Dear [Recruiter Name],"
       - If both are known: "Dear [Recruiter Name] and [Hiring Manager Name],"
       - If neither is known: "Dear Hiring Manager,"
    8. Add a blank line
    9. Write 2-3 paragraphs that:
       - Express interest in the role and company
       - Highlight 2-3 relevant skills/experiences that are explicitly in the resume
       - Explain how those specific skills/experiences could benefit the role
       - Do not claim any skills or experiences not in the resume
    10. Add a blank line
    11. End with "Sincerely,"
    12. Add a blank line
    13. Add the candidate's full name

    Content Requirements:
    - Keep paragraphs concise and focused
    - Maintain professional tone throughout
    - End with a strong call to action
    - Use a blank line between paragraphs
    - Do not include any markdown formatting or special characters
    - Do not include any meta-information or comments

    Contact Information:
    ${contactLines}

    Full Master Resume:
    ${masterResume}

    Job Description:
    ${jobDescription}
  `;

  try {
    const response = await axios.post(config.aiApiUrl, {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: config.aiModel,
      max_tokens: config.maxTokens,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    spinner.stop();
    
    // Clean up the response and apply text wrapping
    const content = response.data.choices[0].message.content
      .trim()
      .replace(/```markdown/g, '')  // Remove markdown code block markers
      .replace(/```/g, '')          // Remove any remaining code block markers
      .replace(/^\s*\/\/.*$/gm, '') // Remove any comment lines
      .trim();
    
    return wrapText(content);
  } catch (error) {
    spinner.stop();
    console.error('Error generating cover letter:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to get suggested cover letter filename
async function getSuggestedCoverLetterFilename(masterResume, jobDescription) {
  const spinner = new Spinner('Getting cover letter filename suggestion...');
  spinner.start();

  const prompt = `
    You are being called through an API to suggest a filename for a cover letter. Using the contact information from the master resume and the job description provided, suggest a clear and professional filename.

    Guidelines:
    - Use only lowercase letters, numbers, and hyphens
    - Do not use spaces or special characters
    - Include the name from the contact info (first initial and last name, without a hyphen)
    - Include a shortened reference to the role
    - Include a shortened version of the company name if available
    - Format: cover-letter-name-role-company
    - Keep it concise but clear
    - Respond with ONLY the filename, no explanation or additional text

    Example formats:
    cover-letter-jsmith-devops-acme
    cover-letter-jdoe-pm-google
    cover-letter-mjones-architect-aws

    Master Resume Contact Info:
    ${masterResume.split('\n').slice(0, 10).join('\n')}

    Job Description:
    ${jobDescription}
  `;

  try {
    const response = await axios.post(config.aiApiUrl, {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: config.aiModel,
      max_tokens: config.maxTokens,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    spinner.stop();
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    spinner.stop();
    console.error('Error getting cover letter filename suggestion:', error.response ? error.response.data : error.message);
    return 'cover-letter';
  }
}

// Function to generate job posting summary
async function generateJobSummary(jobDescription) {
  const spinner = new Spinner('Generating job posting summary...');
  spinner.start();

  const prompt = `
    You are being called through an API to generate a clear, concise summary of a job posting.
    Analyze the job description and create a structured summary that helps the applicant understand:
    1. The key responsibilities and day-to-day activities
    2. The required qualifications and skills
    3. The preferred qualifications and nice-to-haves
    4. Any unique aspects of the role or company culture

    CRITICAL REQUIREMENTS:
    1. Be objective and factual - only include information explicitly stated in the job description
    2. Do not make assumptions or add information not present in the posting
    3. Organize the information clearly with section headers
    4. Keep the summary concise and easy to scan
    5. Do not include any meta-information or comments
    6. Do not wrap the response in a code block or markdown formatting

    Format Requirements:
    - Use clear section headers in ALL CAPS
    - Use bullet points for lists
    - Keep paragraphs short and focused
    - Use a blank line between sections
    - Do not include any markdown formatting or special characters

    Job Description:
    ${jobDescription}
  `;

  try {
    const response = await axios.post(config.aiApiUrl, {
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: config.aiModel,
      max_tokens: config.maxTokens,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    spinner.stop();
    
    // Clean up the response and apply text wrapping
    const content = response.data.choices[0].message.content
      .trim()
      .replace(/```markdown/g, '')  // Remove markdown code block markers
      .replace(/```/g, '')          // Remove any remaining code block markers
      .replace(/^\s*\/\/.*$/gm, '') // Remove any comment lines
      .trim();
    
    return wrapText(content);
  } catch (error) {
    spinner.stop();
    console.error('Error generating job summary:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Main function to run the script
async function main() {
  try {
    // Start the resume generation process
    console.log('Starting resume generation...');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Read master resume
    const masterResume = await fsPromises.readFile(MASTER_RESUME_PATH, 'utf8');

    // Get job description from user
    const jobDescription = await getJobDescription();

    // Get suggested names for folder and files
    const names = await getSuggestedNames(masterResume, jobDescription);
    
    // Get paths for resume files
    const resumePaths = updateOutputPaths(names, 'resume');

    // Generate tailored resume using AI API
    const tailoredResume = await generateTailoredResume(masterResume, jobDescription);

    // Save tailored resume as Markdown
    await fsPromises.writeFile(resumePaths.md, tailoredResume);
    console.log(`Tailored resume saved as Markdown to ${resumePaths.md}`);

    // Convert to PDF
    console.log('Converting Markdown to PDF...');
    const spinner = new Spinner('Converting to PDF...');
    spinner.start();
    try {
      await convertToPdf(resumePaths.md, resumePaths.pdf);
      spinner.stop();
      console.log(`Tailored resume saved as PDF to ${resumePaths.pdf}`);
    } catch (error) {
      spinner.stop();
      console.error('Error during PDF conversion process:', error);
      process.exit(1);
    }

    // Generate job posting summary
    console.log('\nGenerating job posting summary...');
    const jobSummary = await generateJobSummary(jobDescription);
    const summaryPath = path.join(OUTPUT_DIR, names.folder, `job-summary-${names.folder}-${new Date().toISOString().split('T')[0]}.txt`);
    await fsPromises.writeFile(summaryPath, jobSummary);
    console.log(`Job posting summary saved to ${summaryPath}`);

    // Generate cover letter if requested
    if (argv.cover) {
      console.log('\nGenerating cover letter...');
      
      // Get paths for cover letter files using the same naming structure
      const coverLetterPaths = updateOutputPaths(names, 'cover');
      
      // Generate and save cover letter
      const coverLetter = await generateCoverLetter(masterResume, jobDescription);
      await fsPromises.writeFile(coverLetterPaths.txt, coverLetter);
      console.log(`Cover letter saved as text to ${coverLetterPaths.txt}`);
    }

    console.log('\nResume generation and conversion complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();